import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  Firestore,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  setLogLevel,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Desativa logs internos ruidosos do SDK (@firebase/firestore) para evitar que
// oscilações momentâneas de rede ou limites do plano gratuito disparem erros fatais no console.
try {
  setLogLevel('silent');
} catch {
  // ignore
}

const app = initializeApp(firebaseConfig);

function createFirestoreInstance(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        ignoreUndefinedProperties: true,
        localCache: memoryLocalCache(),
        experimentalForceLongPolling: true,
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const db = createFirestoreInstance();
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: boolean | string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): void {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';

  // Ignore transient offline / unavailable / quota exceeded errors
  if (
    code === 'unavailable' ||
    code === 'resource-exhausted' ||
    message.includes('code=unavailable') ||
    message.includes('client is offline') ||
    message.includes('Could not reach Cloud Firestore backend') ||
    message.includes('Quota limit exceeded') ||
    message.includes('Free daily write units')
  ) {
    return;
  }

  const logPayload = {
    code: code || 'unknown',
    operationType,
    path: path || 'unknown',
    message,
  };
  console.warn('Firestore Notice:', JSON.stringify(logPayload));
}
