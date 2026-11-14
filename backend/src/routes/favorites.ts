/**
 * Favoritos en paridad con `FavoriteController` (todo 18).
 *
 * Toggle estricto: `add` debe ser boolean o 0/1. INSERT ... ON DUPLICATE KEY
 * y DELETE; GET con JOIN y ORDER BY created_at DESC.
 */
import type { FastifyInstance } from 'fastify';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { requireAuth } from '../auth/guard.js';
import { positiveInt } from '../auth/validation.js';

/** `undefined` si el campo falta o no es un booleano/0-1 válido. */
function parseAdd(value: unknown): boolean | undefined {
    if (value === true || value === 1 || value === '1') {
        return true;
    }

    if (value === false || value === 0 || value === '0') {
        return false;
    }

    return undefined;
}

function bodyRecord(body: unknown): Record<string, unknown> {
    return body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

export function registerFavoriteRoutes(app: FastifyInstance, pool: Pool): void {
    app.get('/favorites', { preHandler: requireAuth(app) }, async (request, reply) => {
        const user = request.authUser;
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT r.id, r.name, r.difficulty, r.time_minutes, c.id AS country_id, c.name AS country_name, c.emoji
             FROM favorites f
             JOIN recipes r ON r.id = f.recipe_id
             JOIN countries c ON c.id = r.country_id
             WHERE f.user_id = ?
             ORDER BY f.created_at DESC`,
            [user?.id ?? 0]
        );

        return reply.send({
            ok: true,
            favorites: rows.map(row => ({
                id: Number(row['id']),
                name: String(row['name']),
                difficulty: row['difficulty'],
                time_minutes: row['time_minutes'] === null ? null : Number(row['time_minutes']),
                country_id: Number(row['country_id']),
                country_name: String(row['country_name']),
                emoji: row['emoji']
            }))
        });
    });

    app.post('/favorites', { preHandler: requireAuth(app) }, async (request, reply) => {
        const user = request.authUser ?? { id: 0 };
        const body = bodyRecord(request.body);
        const recipeId = positiveInt(body['recipe_id']);

        if (recipeId === null) {
            return reply.code(400).send({ ok: false, error: 'Identificador inválido.' });
        }

        const add = parseAdd(body['add']);

        if (add === undefined) {
            return reply.code(400).send({ ok: false, error: 'Falta el campo add (boolean o 0/1).' });
        }

        const [recipes] = await pool.execute<RowDataPacket[]>('SELECT id FROM recipes WHERE id = ?', [recipeId]);

        if (recipes.length === 0) {
            return reply.code(404).send({ ok: false, error: 'Receta inexistente.' });
        }

        if (add) {
            await pool.execute('INSERT INTO favorites (user_id, recipe_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE recipe_id = recipe_id', [user.id, recipeId]);
        } else {
            await pool.execute('DELETE FROM favorites WHERE user_id = ? AND recipe_id = ?', [user.id, recipeId]);
        }

        return reply.send({ ok: true });
    });
}
