import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  getDocFromServer
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const testConnection = async () => {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
};

export const saveProject = async (project: any) => {
  const user = auth.currentUser;
  if (!user) throw new Error("User must be logged in to save projects");

  const path = `projects/${project.id}`;
  try {
    const projectData = {
      ...project,
      userId: user.uid,
      date: new Date().toISOString()
    };
    await setDoc(doc(db, 'projects', project.id), projectData);
    return projectData;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const fetchUserProjects = async () => {
  const user = auth.currentUser;
  if (!user) return [];

  const path = 'projects';
  try {
    const q = query(collection(db, 'projects'), where('userId', '==', user.uid));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
};

export const getProjectById = async (projectId: string) => {
  const path = `projects/${projectId}`;
  try {
    const docRef = doc(db, 'projects', projectId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data();
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
};

export const updateProjectShare = async (projectId: string, isShared: boolean) => {
  const user = auth.currentUser;
  if (!user) throw new Error("User must be logged in to share projects");

  const path = `projects/${projectId}`;
  try {
    await updateDoc(doc(db, 'projects', projectId), {
      shared: isShared
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const deleteUserProject = async (projectId: string) => {
  const user = auth.currentUser;
  if (!user) throw new Error("User must be logged in to delete projects");

  const path = `projects/${projectId}`;
  try {
    await deleteDoc(doc(db, 'projects', projectId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
};

export const saveUserProfile = async () => {
  const user = auth.currentUser;
  if (!user) return;

  const path = `users/${user.uid}`;
  try {
    await setDoc(doc(db, 'users', user.uid), {
      userId: user.uid,
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL,
      createdAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};
