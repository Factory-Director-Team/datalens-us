import type {CtxSubject} from '../components/auth/types/user';
import {FeaturesConfig} from '../components/features/types';
import type {TemporalConfig} from '../components/temporal/types';
import type {JoinedEmbedEmbeddingSecretColumns} from '../db/presentations/joined-embed-embedding-secret';
import type {Registry} from '../registry';

import {CtxInfo} from './ctx';

export interface PlatformAppConfig {
    features: FeaturesConfig;
    dynamicFeaturesEndpoint?: string;

    multitenant: boolean;
    dlsEnabled: boolean;
    tenantIdOverride?: string;

    accessServiceEnabled: boolean;
    accessBindingsServiceEnabled: boolean;

    masterToken: string[];

    // auth
    authMethods?: string[];
    authTokenPublicKey?: string;

    swaggerEnabled?: boolean;

    temporal?: TemporalConfig;

    dynamicMasterTokenPublicKeys?: Record<string, (string | undefined)[]>;

    /** Embed JWT TTL in seconds. 0 = no expiry. */
    embedTokenTTL?: number;
    /** Algorithm for embed JWT signing/verification (jsonwebtoken). */
    embedTokenAlgorithm?: string;
}

export interface PlatformAppContextParams {
    info: CtxInfo;
    registry: Registry;
    // auth
    user?: CtxSubject;

    embedding?: {
        workbookId: string | number;
        embedRow: JoinedEmbedEmbeddingSecretColumns;
    };
}

export interface PlatformAppDynamicConfig {
    features?: FeaturesConfig;
}
