/**
 * Repositorio de sesiones sobre la tabla `sessions`, en paridad con
 * `api/src/Support/Auth.php` + `AuthService::refresh` (todo 10).
 *
 * Reglas EXACTAS del v1:
 * - create: token de 64 hex, en DB solo `sha256(token)`; `expires_at =
 *   NOW() + INTERVAL SESSION_DAYS DAY`; ip y user_agent (truncado a 255
 *   caracteres) tal como los recibe el PHP;
 * - refresh: purga de expiradas FUERA de la transacción, SELECT ... FOR UPDATE
 *   por hash, tombstone -> reuse detection con ventana de gracia, expirada ->
 *   rollback, válida -> revoke + nueva sesión + commit;
 * - logout: BORRA la sesión actual (sin tombstone) y siempre responde OK.
 *   Así un refresh posterior no confunde un logout benigno con token reuse.
 *
 * No se cambia el esquema ni el aislamiento de InnoDB (REPEATABLE READ).
 */
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { createRefreshToken, hashRefreshToken } from '../auth/refresh-token.js';

/** Ventana para tolerar un refresh repetido por respuesta perdida. */
const REUSE_GRACE_SECONDS = 60;

/** Handle mínimo para ejecutar SQL: el pool o una conexión transaccional. */
export type SessionExecutor = Pick<PoolConnection, 'execute'>;

export type SessionUser = Readonly<{
    id: number;
    username: string;
    role: string;
}>;

export type CreateSessionOptions = Readonly<{
    userId: number;
    sessionDays: number;
    ip?: string | null;
    userAgent?: string | null;
}>;

export type RotateSessionOptions = Readonly<{
    sessionDays: number;
    ip?: string | null;
    userAgent?: string | null;
}>;

export type RotationResult = { ok: true; user: SessionUser; refreshToken: string } | { ok: false };

type SessionRow = RowDataPacket & {
    id: number;
    user_id: number;
    expires_at: string;
    revoked_at: string | null;
    revoked_seconds: number | null;
    expired: number;
    username: string;
    role: string;
};

const MAX_USER_AGENT_LENGTH = 255;

/** `strtotime($expires_at) === false || strtotime(...) <= time()` del PHP.
 * Se mantiene para stubs/tests; la rotación usa `expired` calculado por SQL
 * para no depender de la timezone del proceso Node. */
export function isExpiredSession(expiresAt: string, nowMs: number = Date.now()): boolean {
    const timestamp = Date.parse(expiresAt.replace(' ', 'T'));

    return !Number.isFinite(timestamp) || timestamp <= nowMs;
}

/** `Validation::truncate($userAgent, 255)`: 255 caracteres, no bytes. */
function truncateUserAgent(value: string | null | undefined): string | null {
    if (value === null || value === undefined) {
        return null;
    }

    return Array.from(value).slice(0, MAX_USER_AGENT_LENGTH).join('');
}

/** Inserta una sesión nueva y devuelve el token CRUDO (la DB guarda el hash). */
export async function createSession(executor: SessionExecutor, options: CreateSessionOptions): Promise<string> {
    if (!Number.isSafeInteger(options.sessionDays) || options.sessionDays <= 0) {
        throw new Error('SESSION_DAYS debe ser un entero positivo.');
    }

    const rawToken = createRefreshToken();
    const tokenHash = hashRefreshToken(rawToken);

    await executor.execute(
        `INSERT INTO sessions (user_id, token, expires_at, revoked_at, ip, user_agent)
         VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), NULL, ?, ?)`,
        [options.userId, tokenHash, options.sessionDays, options.ip ?? null, truncateUserAgent(options.userAgent)]
    );

    return rawToken;
}

/** `DELETE FROM sessions WHERE expires_at < NOW()`, con índice dedicado. */
export async function purgeExpiredSessions(executor: SessionExecutor): Promise<void> {
    await executor.execute('DELETE FROM sessions WHERE expires_at < NOW() LIMIT 1000');
}

/** `SELECT ... FOR UPDATE` por hash de token, con expiración evaluada por SQL. */
export async function findSessionForUpdate(executor: SessionExecutor, rawToken: string): Promise<SessionRow | null> {
    const [rows] = await executor.execute<SessionRow[]>(
        `SELECT s.id, s.user_id, s.expires_at, s.revoked_at,
                TIMESTAMPDIFF(SECOND, s.revoked_at, NOW()) AS revoked_seconds,
                (s.expires_at <= NOW()) AS expired,
                u.username, u.role
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = ?
         FOR UPDATE`,
        [hashRefreshToken(rawToken)]
    );

    return rows[0] ?? null;
}

/** Soft-revoke: deja el tombstone con `revoked_at = NOW()`. */
export async function revokeSession(executor: SessionExecutor, rawToken: string): Promise<void> {
    await executor.execute(
        `UPDATE sessions
         SET revoked_at = NOW()
         WHERE token = ? AND revoked_at IS NULL`,
        [hashRefreshToken(rawToken)]
    );
}

/** Logout: borra la fila para que el token no quede como tombstone reutilizable. */
export async function deleteSession(executor: SessionExecutor, rawToken: string): Promise<void> {
    if (rawToken === '') {
        return;
    }

    await executor.execute('DELETE FROM sessions WHERE token = ?', [hashRefreshToken(rawToken)]);
}

/** Política de reuse detection del PHP: borra TODAS las sesiones del usuario. */
export async function revokeAllUserSessions(executor: SessionExecutor, userId: number): Promise<void> {
    await executor.execute('DELETE FROM sessions WHERE user_id = ?', [userId]);
}

/**
 * Rota un refresh token con la transacción y la política del v1.
 *
 * Carrera de doble refresh: el segundo SELECT ... FOR UPDATE espera al
 * commit del primero, ve `revoked_at` y dispara reuse detection (borra la
 * sesión recién creada). Resultado: exactamente un OK y un rechazo.
 */
export async function rotateRefreshToken(pool: Pool, rawToken: string, options: RotateSessionOptions): Promise<RotationResult> {
    if (rawToken === '') {
        return { ok: false };
    }

    if (!Number.isSafeInteger(options.sessionDays) || options.sessionDays <= 0) {
        throw new Error('SESSION_DAYS debe ser un entero positivo.');
    }

    const connection = await pool.getConnection();

    try {
        // Fuera de la transacción: no mantiene locks mientras recorre expiradas.
        await purgeExpiredSessions(pool);

        await connection.beginTransaction();

        const row = await findSessionForUpdate(connection, rawToken);

        if (row === null) {
            await connection.rollback();

            return { ok: false };
        }

        if (row.revoked_at !== null) {
            const revokedSeconds = Number(row.revoked_seconds ?? 0);

            // Respuesta perdida / refresh repetido: no borrar todas las sesiones.
            if (revokedSeconds > REUSE_GRACE_SECONDS) {
                await revokeAllUserSessions(connection, row.user_id);
                await connection.commit();
            } else {
                await connection.rollback();
            }

            return { ok: false };
        }

        if (Number(row.expired) === 1) {
            await connection.rollback();

            return { ok: false };
        }

        await revokeSession(connection, rawToken);

        const refreshToken = await createSession(connection, {
            userId: row.user_id,
            sessionDays: options.sessionDays,
            ip: options.ip ?? null,
            userAgent: options.userAgent ?? null
        });

        await connection.commit();

        return {
            ok: true,
            user: { id: row.user_id, username: row.username, role: row.role },
            refreshToken
        };
    } catch (error) {
        try {
            await connection.rollback();
        } catch {
            // Si la transacción ya cerró, no hay nada que revertir.
        }

        throw error;
    } finally {
        connection.release();
    }
}

/** Logout del v1: borra la sesión si vino token y responde OK aunque no exista. */
export async function logoutSession(executor: SessionExecutor, rawToken: string): Promise<void> {
    await deleteSession(executor, rawToken);
}
