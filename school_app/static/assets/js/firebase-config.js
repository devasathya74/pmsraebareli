const parseJson = async (response) => {
    try {
        return await response.json();
    } catch (error) {
        return { success: false, error: "invalid-server-response" };
    }
};

const toSdkError = (payload, fallbackCode = "request-failed") => {
    const error = new Error(payload?.errorMessage || payload?.error || fallbackCode);
    error.code = payload?.error || fallbackCode;
    return error;
};

const resourceRoutes = {
    users: "/api/users",
    students: "/api/students",
    teachers: "/api/teachers",
    admissions: "/api/admissions",
    attendance: "/api/attendance",
    messages: "/api/messages",
    notifications: "/api/notifications",
    inventory: "/api/inventory",
    contacts: "/api/contacts",
    fees: "/api/fees",
    expenses: "/api/expenses",
    salary_slips: "/api/salary-slips",
    exam_schedules: "/api/exam-schedules"
};

let currentUser = null;
let sessionLoaded = false;
let sessionPromise = null;
let lastVerifiedPassword = "";
let csrfToken = "";
let loginCaptcha = "";
const authListeners = new Set();
let lastRequestTimestamp = Date.now();
let sessionTimeoutMinutes = 5;
let sessionMonitorInterval = null;

const auth = {
    get currentUser() {
        return currentUser;
    },
    onAuthStateChanged(callback) {
        return authHelper.onAuthChange(callback);
    }
};

const db = { provider: "flask-session-api" };

const normalizeCollectionName = (collectionName) => collectionName;
const getResourceBase = (collectionName) => resourceRoutes[normalizeCollectionName(collectionName)];

const withJsonHeaders = (extra = {}) => ({
    "Content-Type": "application/json",
    Accept: "application/json",
    ...extra
});

const notifyAuthListeners = () => {
    authListeners.forEach((callback) => {
        try {
            callback(currentUser);
        } catch (error) {
            console.error("Auth listener error:", error);
        }
    });
};

const updateSessionState = (payload) => {
    if (payload?.csrf_token) {
        csrfToken = payload.csrf_token;
    }
    if (Object.prototype.hasOwnProperty.call(payload || {}, "user")) {
        currentUser = payload.user;
        if (currentUser) {
            startSessionMonitor();
        } else {
            stopSessionMonitor();
        }
    }
    if (payload?.session_timeout_minutes) {
        sessionTimeoutMinutes = payload.session_timeout_minutes;
    }
};

const startSessionMonitor = () => {
    if (sessionMonitorInterval) return;
    lastRequestTimestamp = Date.now();
    sessionMonitorInterval = setInterval(() => {
        if (!currentUser) {
            stopSessionMonitor();
            return;
        }
        const elapsedMinutes = (Date.now() - lastRequestTimestamp) / 60000;
        if (elapsedMinutes >= sessionTimeoutMinutes) {
            console.warn("Session expired due to inactivity (no server requests for 5+ minutes).");
            authHelper.logout();
        }
    }, 10000); // Check every 10 seconds
};

const stopSessionMonitor = () => {
    if (sessionMonitorInterval) {
        clearInterval(sessionMonitorInterval);
        sessionMonitorInterval = null;
    }
};

const ensureCsrfToken = async (force = false) => {
    // 1. Try meta tag first if not already set or if forcing
    if (!csrfToken || force) {
        const meta = document.querySelector('meta[name="csrf-token"]');
        if (meta && meta.content) {
            csrfToken = meta.content;
            if (!force) return csrfToken;
        }
    }

    // 2. Fallback to API if still empty or forcing refresh
    if (csrfToken && !force) {
        return csrfToken;
    }
    
    try {
        const response = await fetch("/api/security/csrf", {
            headers: { Accept: "application/json" },
            credentials: "same-origin"
        });
        const payload = await parseJson(response);
        if (payload?.success && payload.csrf_token) {
            csrfToken = payload.csrf_token;
        }
    } catch (e) {
        console.error("[CSRF] Failed to fetch token:", e);
    }
    return csrfToken;
};

const ensureCaptcha = async (force = false) => {
    if (loginCaptcha && !force) {
        return loginCaptcha;
    }
    const response = await fetch("/api/auth/captcha", {
        headers: { Accept: "application/json" },
        credentials: "same-origin"
    });
    const payload = await parseJson(response);
    if (payload?.success) {
        loginCaptcha = payload.captcha || "";
        if (payload.csrf_token) {
            csrfToken = payload.csrf_token;
        }
    }
    return loginCaptcha;
};

const ensureSession = async (force = false) => {
    if (sessionLoaded && !force) {
        return currentUser;
    }
    if (sessionPromise && !force) {
        return sessionPromise;
    }
    sessionPromise = fetch("/api/auth/session", {
        headers: { Accept: "application/json" },
        credentials: "same-origin"
    })
        .then(async (response) => {
            lastRequestTimestamp = Date.now();
            return parseJson(response);
        })
        .then((payload) => {
            if (payload?.success) {
                updateSessionState(payload);
            } else {
                currentUser = null;
            }
            sessionLoaded = true;
            notifyAuthListeners();
            return currentUser;
        })
        .catch(() => {
            currentUser = null;
            sessionLoaded = true;
            notifyAuthListeners();
            return null;
        })
        .finally(() => {
            sessionPromise = null;
        });
    return sessionPromise;
};

const requestJson = async (url, options = {}) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes((options.method || "GET").toUpperCase())) {
        await ensureCsrfToken();
    }
    const headers = options.body instanceof FormData
        ? { Accept: "application/json", "X-CSRF-Token": csrfToken }
        : withJsonHeaders({ "X-CSRF-Token": csrfToken });
    const response = await fetch(url, {
        credentials: "same-origin",
        ...options,
        headers: { ...headers, ...(options.headers || {}) }
    });
    
    // Update timestamp on every server request
    lastRequestTimestamp = Date.now();

    const result = await parseJson(response);
    if (result?.csrf_token) {
        csrfToken = result.csrf_token;
    }
    return { response, result };
};

const buildQueryPayload = (conditions = [], limitValue = null, startAfterId = null, orderByField = null, orderDirection = "asc") => {
    const filters = [];
    const order_by = [];
    (conditions || []).forEach((clause) => {
        if (!clause || !clause.type) return;
        if (clause.type === "where") filters.push({ field: clause.field, op: clause.operator, value: clause.value });
        if (clause.type === "orderBy") order_by.push({ field: clause.field, direction: clause.direction || "asc" });
        if (clause.type === "limit" && limitValue == null) limitValue = clause.value;
        if (clause.type === "startAfter" && !startAfterId) startAfterId = clause.id;
    });
    if (orderByField && !order_by.length) {
        order_by.push({ field: orderByField, direction: orderDirection });
    }
    return { filters, order_by, limit: limitValue, start_after_id: startAfterId };
};

const buildSnapshotDoc = (item) => ({ id: item.id, data: () => ({ ...item }) });
const buildQuerySnapshot = (items) => {
    const docs = (items || []).map(buildSnapshotDoc);
    return {
        empty: docs.length === 0,
        docs,
        forEach(callback) {
            docs.forEach(callback);
        }
    };
};

const authHelper = {
    async getLoginCaptcha(force = false) {
        return ensureCaptcha(force);
    },

    async login(email, password, captcha) {
        try {
            await ensureCsrfToken();
            const { response, result } = await requestJson("/api/auth/login", {
                method: "POST",
                body: JSON.stringify({ email, password, captcha })
            });
            await ensureCaptcha(true);
            if (!response.ok || !result.success) {
                return {
                    success: false,
                    error: result.error || "auth/invalid-credential",
                    retry_after: result.retry_after || null
                };
            }
            currentUser = result.user;
            sessionLoaded = true;
            notifyAuthListeners();
            return { success: true, user: result.user };
        } catch (error) {
            return { success: false, error: "auth/network-request-failed" };
        }
    },

    async register(email, password, userData = {}) {
        return this.createSecondaryAccount(email, password, userData);
    },

    async createSecondaryAccount(email, password, userData = {}) {
        const { response, result } = await requestJson("/api/auth/create-user", {
            method: "POST",
            body: JSON.stringify({ email, password, ...userData })
        });
        if (!response.ok || !result.success) {
            return { success: false, error: result.error || "auth/user-creation-failed" };
        }
        return { success: true, uid: result.uid };
    },

    async logout() {
        try {
            await requestJson("/api/auth/logout", { method: "POST" });
        } catch (error) {
            console.warn("Logout request failed:", error);
        }
        currentUser = null;
        sessionLoaded = true;
        lastVerifiedPassword = "";
        notifyAuthListeners();
        const path = window.location.pathname;
        if (!path.endsWith("/auth/login")) {
            window.location.href = "/auth/login";
        }
        return { success: true };
    },

    getCurrentUser() {
        return currentUser;
    },

    onAuthChange(callback) {
        authListeners.add(callback);
        if (sessionLoaded) {
            callback(currentUser);
        } else {
            ensureSession();
        }
        return () => authListeners.delete(callback);
    }
};

const queryApi = async (collectionName, payload = {}) => {
    const base = getResourceBase(collectionName);
    if (!base) {
        throw toSdkError({ error: `unsupported-collection:${collectionName}` }, "unsupported-collection");
    }
    const { response, result } = await requestJson(`${base}/list`, {
        method: "POST",
        body: JSON.stringify(payload)
    });
    if (!response.ok || !result.success) {
        throw toSdkError(result, "query-failed");
    }
    return result;
};

const firestoreHelper = {
    async addDocument(collectionName, data) {
        if (collectionName === "contacts" && !currentUser) {
            const { result } = await requestJson("/api/public/contacts", {
                method: "POST",
                body: JSON.stringify(data)
            });
            return result;
        }
        const base = getResourceBase(collectionName);
        const { result } = await requestJson(base, {
            method: "POST",
            body: JSON.stringify(data)
        });
        return result;
    },

    async getDocuments(collectionName, conditions = null) {
        if (collectionName === "notifications" && !currentUser) {
            const response = await fetch("/api/public/notifications", { headers: { Accept: "application/json" } });
            return parseJson(response);
        }
        try {
            return await queryApi(collectionName, buildQueryPayload(conditions));
        } catch (error) {
            return { success: false, error: error.code || "query-failed", data: [] };
        }
    },

    async getDocument(collectionName, docId) {
        const base = getResourceBase(collectionName);
        const response = await fetch(`${base}/${encodeURIComponent(docId)}`, {
            headers: { Accept: "application/json" },
            credentials: "same-origin"
        });
        return parseJson(response);
    },

    async getPaginatedData(collectionName, pageSize = 20, lastDoc = null, orderByField = "createdAt") {
        try {
            const startAfterId = typeof lastDoc === "string" ? lastDoc : lastDoc?.id || null;
            const result = await queryApi(collectionName, buildQueryPayload([], pageSize, startAfterId, orderByField, "desc"));
            const lastVisible = result.data.length ? { id: result.data[result.data.length - 1].id } : null;
            return { success: true, data: result.data, lastDoc: lastVisible, hasMore: result.data.length === pageSize };
        } catch (error) {
            return { success: false, error: error.code || "query-failed", data: [], lastDoc: null, hasMore: false };
        }
    },

    async updateDocument(collectionName, docId, data) {
        const base = getResourceBase(collectionName);
        const { result } = await requestJson(`${base}/${encodeURIComponent(docId)}`, {
            method: "PATCH",
            body: JSON.stringify(data)
        });
        return result;
    },

    async deleteDocument(collectionName, docId) {
        const base = getResourceBase(collectionName);
        const { result } = await requestJson(`${base}/${encodeURIComponent(docId)}`, {
            method: "DELETE"
        });
        return result;
    },

    async getCollectionByQuery(collectionName, field, operator, value) {
        return this.getDocuments(collectionName, [where(field, operator, value)]);
    },

    async setDocument(collectionName, docId, data) {
        const base = getResourceBase(collectionName);
        const { result } = await requestJson(`${base}/${encodeURIComponent(docId)}`, {
            method: "PUT",
            body: JSON.stringify(data)
        });
        return result;
    }
};

const storageHelper = {
    async uploadFile(file, path, bucket = "admissions") {
        const formData = new FormData();
        const segments = String(path || "").split("/").filter(Boolean);
        const folder = segments.length > 1 ? segments.slice(0, -1).join("/") : (segments[0] || bucket || "general");
        formData.append("file", file);
        formData.append("folder", folder);
        formData.append("bucket", bucket);
        const { response, result } = await requestJson("/api/storage/upload", {
            method: "POST",
            body: formData
        });
        if (!response.ok || !result.success) {
            return { success: false, error: result.error || "upload-failed" };
        }
        return { success: true, url: result.url || result.data?.file_url };
    },
    async getFileURL(path) {
        return { success: true, url: path };
    },
    async uploadStudentFile(file, filename) {
        return this.uploadFile(file, `students/${filename}`);
    },
    async uploadTeacherFile(file, filename) {
        return this.uploadFile(file, `teachers/${filename}`);
    },
    async uploadAdmissionDocument(file, filename) {
        return this.uploadFile(file, `admissions/documents/${filename}`);
    },
    async uploadAdmissionImage(file, filename) {
        return this.uploadFile(file, `admissions/images/${filename}`);
    }
};

const admissionHelper = {
    async submitAdmission(formData, files = {}) {
        try {
            const studentName = formData.student_name || formData.scholarName || "student";
            const sanitizedName = studentName.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, "_").substring(0, 50);
            const registrationNumber = `PMS-${Math.floor(10000 + Math.random() * 90000)}`;
            
            // 1. Save metadata first to Firestore
            const initialData = {
                ...formData,
                documents: {},
                status: "pending",
                submittedAt: new Date().toISOString(),
                registrationNumber,
                id: registrationNumber
            };
            
            const saveResult = await firestoreHelper.setDocument("admissions", registrationNumber, initialData);
            if (!saveResult.success) throw new Error(saveResult.error || "admission-save-failed");

            // 2. Upload files if any exist
            const uploadedFiles = {};
            const uploaders = [
                ["birthCertificate", "birth_certificate", storageHelper.uploadAdmissionDocument.bind(storageHelper)],
                ["aadharCard", "aadhar_card", storageHelper.uploadAdmissionDocument.bind(storageHelper)],
                ["casteCertificate", "caste_certificate", storageHelper.uploadAdmissionDocument.bind(storageHelper)],
                ["domicileCertificate", "domicile_certificate", storageHelper.uploadAdmissionDocument.bind(storageHelper)],
                ["photo", "photo", storageHelper.uploadAdmissionImage.bind(storageHelper)]
            ];

            for (const [key, suffix, uploader] of uploaders) {
                const file = files[key];
                if (!file || !(file instanceof File)) continue;
                
                const extension = (file.name || "").split(".").pop() || "jpg";
                const result = await uploader(file, `${sanitizedName}_${suffix}.${extension}`);
                if (result.success) {
                    uploadedFiles[key] = result.url;
                }
            }

            // Normalise legacy keys
            if (uploadedFiles.casteCertificate) uploadedFiles.casteCert = uploadedFiles.casteCertificate;
            if (uploadedFiles.domicileCertificate) uploadedFiles.domicileCert = uploadedFiles.domicileCertificate;

            // 3. Update Firestore record with document URLs
            if (Object.keys(uploadedFiles).length > 0) {
                await firestoreHelper.updateDocument("admissions", registrationNumber, {
                    documents: uploadedFiles
                });
            }

            return { success: true, id: registrationNumber };
        } catch (error) {
            console.error("Admission submission failed:", error);
            return { success: false, error: error.message || "admission-submit-failed" };
        }
    },
    async getAdmissionStatus(admissionId) {
        return firestoreHelper.getDocument("admissions", admissionId);
    }
};

const contactHelper = {
    async submitContact(formData) {
        return firestoreHelper.addDocument("contacts", { ...formData, status: "new", read: false });
    }
};

const analyticsHelper = {
    logEvent(eventName, eventParams = {}) {
        if (typeof window.gtag === "function") {
            window.gtag("event", eventName, eventParams);
        }
    },
    logPageView(pageName) {
        this.logEvent("page_view", { page_name: pageName });
    }
};

const collection = (_db, collectionName) => ({ type: "collection", collection: normalizeCollectionName(collectionName) });
const where = (field, operator, value) => ({ type: "where", field, operator, value });
const orderBy = (field, direction = "asc") => ({ type: "orderBy", field, direction });
const limit = (value) => ({ type: "limit", value });
const startAfter = (docRef) => ({ type: "startAfter", id: typeof docRef === "string" ? docRef : docRef?.id || null });
const query = (source, ...clauses) => ({ type: "query", collection: source.collection, clauses });
const doc = (_db, collectionName, docId) => ({ collection: normalizeCollectionName(collectionName), id: docId });

const getDocs = async (source) => {
    let result;
    if (source.type === "collection") {
        result = await firestoreHelper.getDocuments(source.collection);
    } else {
        result = await queryApi(source.collection, buildQueryPayload(source.clauses));
    }
    if (!result.success) throw toSdkError(result, "query-failed");
    return buildQuerySnapshot(result.data || []);
};

const getDoc = async (docRef) => {
    const result = await firestoreHelper.getDocument(docRef.collection, docRef.id);
    if (!result.success) {
        return { exists: () => false, id: docRef.id, data: () => null };
    }
    return { exists: () => true, id: result.data.id, data: () => ({ ...result.data }) };
};

const setDoc = async (docRef, data) => {
    const result = await firestoreHelper.setDocument(docRef.collection, docRef.id, data);
    if (!result.success) throw toSdkError(result, "set-failed");
    return result;
};

const updateDoc = async (docRef, data) => {
    const result = await firestoreHelper.updateDocument(docRef.collection, docRef.id, data);
    if (!result.success) throw toSdkError(result, "update-failed");
    return result;
};

const deleteDoc = async (docRef) => {
    const result = await firestoreHelper.deleteDocument(docRef.collection, docRef.id);
    if (!result.success) throw toSdkError(result, "delete-failed");
    return result;
};

const addDoc = async (collectionRef, data) => {
    const result = await firestoreHelper.addDocument(collectionRef.collection, data);
    if (!result.success) throw toSdkError(result, "create-failed");
    return { id: result.id };
};

const onAuthStateChanged = (_auth, callback) => authHelper.onAuthChange(callback);
const EmailAuthProvider = { credential(email, password) { return { email, password }; } };

const reauthenticateWithCredential = async (_user, credential) => {
    const { response, result } = await requestJson("/api/auth/verify-password", {
        method: "POST",
        body: JSON.stringify({ password: credential.password })
    });
    if (!response.ok || !result.success) throw toSdkError(result, "auth/wrong-password");
    lastVerifiedPassword = credential.password;
    return { success: true };
};

const updatePassword = async (_user, newPassword) => {
    const { response, result } = await requestJson("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: lastVerifiedPassword, new_password: newPassword })
    });
    if (!response.ok || !result.success) throw toSdkError(result, "auth/password-update-failed");
    lastVerifiedPassword = "";
    return { success: true };
};

window.authHelper = authHelper;
window.firestoreHelper = firestoreHelper;
window.storageHelper = storageHelper;

ensureSession();
ensureCsrfToken();

export {
    admissionHelper,
    addDoc,
    analyticsHelper,
    auth,
    authHelper,
    collection,
    contactHelper,
    db,
    deleteDoc,
    doc,
    EmailAuthProvider,
    firestoreHelper,
    getDoc,
    getDocs,
    limit,
    onAuthStateChanged,
    orderBy,
    query,
    reauthenticateWithCredential,
    setDoc,
    startAfter,
    storageHelper,
    updateDoc,
    updatePassword,
    where
};
