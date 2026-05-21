rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper: Is the user signed in?
    function isSignedIn() {
      return request.auth != null;
    }

    // Helper: Check if the user is verified (Google Login usually is)
    function isVerified() {
      return isSignedIn() && (request.auth.token.email_verified == true);
    }

    // Helper: Is the document ID valid?
    function isValidId(id) {
      return id is string && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$');
    }

    // Helper: Validate Project structure
    function isValidProject(data) {
      return data.keys().hasAll(['id', 'name', 'userId', 'points', 'date']) &&
             data.id is string && data.id.size() <= 128 &&
             data.name is string && data.name.size() <= 200 &&
             data.userId == request.auth.uid &&
             data.points is list && data.points.size() <= 1000 &&
             data.date is string &&
             (!('areaSqMeters' in data) || data.areaSqMeters is number) &&
             (!('perimeter' in data) || data.perimeter is number) &&
             (!('unit' in data) || data.unit is string) &&
             (!('shared' in data) || data.shared is bool);
    }

    // Default deny
    match /{document=**} {
      allow read, write: if false;
    }

    // Projects collection
    match /projects/{projectId} {
      allow get: if (resource.data.shared == true) || (isVerified() && resource.data.userId == request.auth.uid);
      allow list: if isVerified() && resource.data.userId == request.auth.uid;
      allow create: if isVerified() && isValidId(projectId) && isValidProject(request.resource.data);
      allow update: if isVerified() && isValidId(projectId) && 
                      resource.data.userId == request.auth.uid && 
                      isValidProject(request.resource.data) &&
                      request.resource.data.userId == resource.data.userId; // Immutable owner
      allow delete: if isVerified() && resource.data.userId == request.auth.uid;
    }

    // Users collection
    match /users/{userId} {
      allow get: if isVerified() && (userId == request.auth.uid);
      allow create: if isVerified() && (userId == request.auth.uid) && 
                      request.resource.data.userId == request.auth.uid;
      allow update: if isVerified() && (userId == request.auth.uid) && 
                      request.resource.data.userId == resource.data.userId;
    }
  }
}
