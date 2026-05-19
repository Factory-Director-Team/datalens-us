import type {Algorithm} from 'jsonwebtoken';
import jwt from 'jsonwebtoken';

import type {AppContext} from '@gravity-ui/nodekit';
import {AppError} from '@gravity-ui/nodekit';

import {US_ERRORS} from '../../../const';
import {EmbedModel, EmbedModelColumn} from '../../../db/models/new/embed';
import {JoinedEmbedEmbeddingSecret} from '../../../db/presentations/joined-embed-embedding-secret';
import Utils from '../../../utils';

import {getReplica} from '../utils';

export type EmbedJwtPayload = {
    embedId: string;
    params?: Record<string, unknown>;
};

export type DecodedEmbedToken = {
    embedId: string;
    iat: number;
    exp: number;
    params?: Record<string, unknown>;
};

export function signEmbedToken(
    ctx: AppContext,
    args: {
        secret: string;
        embedIdEncoded: string;
        params?: Record<string, unknown>;
        /** Overrides ctx.config.embedTokenTTL when set */
        ttlSeconds?: number;
    },
): string {
    const ttl =
        args.ttlSeconds !== undefined ? args.ttlSeconds : Number(ctx.config.embedTokenTTL ?? 0);
    const algorithm = (ctx.config.embedTokenAlgorithm || 'HS256') as Algorithm;

    const payload: EmbedJwtPayload = {
        embedId: args.embedIdEncoded,
        ...(args.params && Object.keys(args.params).length ? {params: args.params} : {}),
    };

    return jwt.sign(payload, args.secret, {
        algorithm,
        ...(ttl > 0 ? {expiresIn: ttl} : {}),
    });
}

export async function verifyEmbedToken(ctx: AppContext, rawToken: string | undefined) {
    if (!rawToken || Array.isArray(rawToken)) {
        throw new AppError(US_ERRORS.EMBED_TOKEN_INVALID, {
            code: US_ERRORS.EMBED_TOKEN_INVALID,
        });
    }

    const decoded = jwt.decode(rawToken, {complete: true});
    const payload = decoded?.payload;
    if (
        !decoded ||
        typeof payload === 'string' ||
        !payload ||
        typeof payload !== 'object' ||
        !('embedId' in payload)
    ) {
        throw new AppError(US_ERRORS.EMBED_TOKEN_INVALID, {
            code: US_ERRORS.EMBED_TOKEN_INVALID,
        });
    }

    const embedIdEnc = (payload as EmbedJwtPayload).embedId;
    let embedIdDecoded: string;
    try {
        embedIdDecoded = Utils.decodeId(embedIdEnc);
    } catch {
        throw new AppError(US_ERRORS.EMBED_TOKEN_INVALID, {
            code: US_ERRORS.EMBED_TOKEN_INVALID,
        });
    }

    const row = await JoinedEmbedEmbeddingSecret.findOne({
        trx: getReplica(),
        where: {
            [`${EmbedModel.tableName}.${EmbedModelColumn.EmbedId}`]: embedIdDecoded,
        },
    });

    if (!row) {
        throw new AppError(US_ERRORS.NOT_EXIST_ENTRY, {
            code: US_ERRORS.NOT_EXIST_ENTRY,
        });
    }

    const algorithm = (ctx.config.embedTokenAlgorithm || 'HS256') as Algorithm;

    try {
        jwt.verify(rawToken, row.publicKey, {algorithms: [algorithm]});
    } catch (e: unknown) {
        if (
            e &&
            typeof e === 'object' &&
            'name' in e &&
            (e as {name: string}).name === 'TokenExpiredError'
        ) {
            throw new AppError(US_ERRORS.EMBED_TOKEN_EXPIRED, {
                code: US_ERRORS.EMBED_TOKEN_EXPIRED,
            });
        }
        throw new AppError(US_ERRORS.EMBED_TOKEN_INVALID, {
            code: US_ERRORS.EMBED_TOKEN_INVALID,
        });
    }

    const {iat = 0, exp = 0} = payload as {iat?: number; exp?: number};

    const tokenDecoded: DecodedEmbedToken = {
        embedId: embedIdEnc,
        iat: typeof iat === 'number' ? iat : 0,
        exp: typeof exp === 'number' ? exp : 0,
        params: (payload as EmbedJwtPayload).params,
    };

    return {
        row,
        tokenDecoded,
    };
}
