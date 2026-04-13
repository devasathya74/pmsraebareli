// Admin Dashboard JavaScript
// Handles all CRUD operations for students, teachers, admissions, and notifications

import { authHelper, firestoreHelper, analyticsHelper, storageHelper, collection, query, where, getDocs, orderBy, limit, addDoc, db, auth, updatePassword, reauthenticateWithCredential, EmailAuthProvider, onAuthStateChanged } from './firebase-config.js';

// Expose helpers globally so inline scripts on any page can call them
window.firestoreHelper = firestoreHelper;
window.authHelper = authHelper;

// Global state
let allAdmissions = [];
let allStudents = [];
let allTeachers = [];
window.allStudents = allStudents;
window.allTeachers = allTeachers;
let allMessages = [];
let allNotifications = [];
let currentEditingStudent = null;
let currentEditingTeacher = null;

// Helper: Toast Notification
window.showToast = function (type, message) {
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg transform transition-all duration-300 translate-y-0 ${type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`;
    toast.innerHTML = `
        <div class="flex items-center gap-2">
            <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
            <span class="font-bold">${message}</span>
        </div>
    `;
    document.body.appendChild(toast);

    // Animate out
    setTimeout(() => {
        toast.classList.add('-translate-y-full', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

// Roll Number Edit Logic
let editingRollId = null;

window.openRollNoModal = function (id, currentVal) {
    editingRollId = id;
    const input = document.getElementById('edit-roll-input');
    input.value = currentVal === '-' ? '' : currentVal;
    document.getElementById('roll-no-modal').classList.remove('hidden');
    setTimeout(() => input.focus(), 100);
}

window.closeRollNoModal = function () {
    document.getElementById('roll-no-modal').classList.add('hidden');
    editingRollId = null;
}

window.saveRollNo = async function () {
    if (!editingRollId) return;

    const newVal = document.getElementById('edit-roll-input').value.trim();
    const btn = document.querySelector('#roll-no-modal button:last-child');
    const originalText = btn.innerHTML;

    try {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        btn.disabled = true;

        // Update Firestore
        const result = await firestoreHelper.updateDocument('students', editingRollId, { rollNumber: newVal });

        if (result.success) {
            // Optimistic Local Update
            const student = allStudents.find(s => s.id === editingRollId);
            if (student) {
                student.rollNumber = newVal;
                // Refresh current view
                student.rollNumber = newVal;
                // Refresh current view (All loaded students)
                displayStudents(allStudents);
            }
            closeRollNoModal();
            showToast('success', 'Roll Number updated successfully');
        } else {
            showToast('error', 'Failed to update Roll Number');
        }
    } catch (error) {
        console.error('Error updating roll no:', error);
        showToast('error', 'An error occurred');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// Initialize dashboard
export async function initDashboard() {
    // Check authentication
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            // Centralized logout handles redirect
            return;
        }

        const userDoc = await firestoreHelper.getDocument('users', user.uid);
        if (userDoc.success) {
            const userData = userDoc.data;
            const role = userData.role;

            if (role !== 'admin' && role !== 'principal') {
                alert('Access Denied! आपके पास इस पेज को देखने की अनुमति नहीं है।');
                window.location.href = '../index.html';
                return;
            }

            const userNameEl = document.getElementById('user-name');
            const adminNameEl = document.getElementById('admin-name');
            if (userNameEl) userNameEl.textContent = userData.name || user.email;
            if (adminNameEl) adminNameEl.textContent = userData.name || 'Admin';

            await loadAllData();
        } else {
            alert('User data not found!');
            await authHelper.logout();
            window.location.href = 'login.html';
        }
    });

    // Setup event listeners
    setupEventListeners();

    // Check for tab parameter in URL
    const urlParams = new URLSearchParams(window.location.search);
    const tab = urlParams.get('tab');
    if (tab) {
        switchTab(tab);
    }
}

// Guard flag to prevent duplicate event listener registration
let eventListenersSetup = false;

// Setup all event listeners
function setupEventListeners() {
    // Prevent duplicate event listener registration
    if (eventListenersSetup) {
        console.log('Event listeners already setup, skipping...');
        return;
    }
    eventListenersSetup = true;
    // Logout
    // Logout listener removed - handled by onclick in dropdown

    // Make helpers available globally
    window.authHelper = authHelper;
    window.firestoreHelper = firestoreHelper;
    window.storageHelper = storageHelper; // Just in case


    // Form Listeners - Use arrow functions to ensure the handler is resolved at call time or ensure defined.
    // Ideally, functions should be defined before this runs, or we rely on window.functionName if defined earlier.
    // Since setupEventListeners is called at the end (inside initDashboard), all window.* assignments should have run by then?
    // Wait, initDashboard is called at the end. Top level assignments run immediately.
    // 'window.handleTeacherSubmit = ...' is at line 572 (top level). So it will be defined when initDashboard runs.

    // Form Listeners - EXPLICITLY REMOVED to prevent double submission.
    // The forms already have onsubmit="handle...Submit(event)" in the HTML.
    // adding addEventListener here causes the handler to run TWICE.

    const notifForm = document.getElementById('notification-form');
    if (notifForm) notifForm.addEventListener('submit', (e) => handleNotificationSubmit(e));
    // handleNotificationSubmit was async function handleNotificationSubmit... which is hoisted in module scope? 
    // Wait, modules invoke rigorous mode.
    // function decls are hoisted to top of module.
    // So handleNotificationSubmit is available.
    // But handleStudentSubmit and handleTeacherSubmit are window assignments, so they are available after execution reaches their lines.

    // Monitoring Sub-tabs
    window.switchMonitorTab = function (type) {
        const attBtn = document.getElementById('tab-monitor-attendance');
        const resBtn = document.getElementById('tab-monitor-results');
        const attView = document.getElementById('monitor-view-attendance');
        const resView = document.getElementById('monitor-view-results');

        if (type === 'attendance') {
            attBtn.className = "px-4 py-2 rounded-md bg-blue-100 text-blue-700 font-medium";
            resBtn.className = "px-4 py-2 rounded-md text-gray-600 hover:bg-gray-50";
            attView.classList.remove('hidden');
            resView.classList.add('hidden');
            loadClassAttendance();
        } else {
            resBtn.className = "px-4 py-2 rounded-md bg-blue-100 text-blue-700 font-medium";
            attBtn.className = "px-4 py-2 rounded-md text-gray-600 hover:bg-gray-50";
            resView.classList.remove('hidden');
            attView.classList.add('hidden');
            loadClassResults();
        }
    }

    // Quick Navigation
    window.quickNav = function (destination) {
        if (destination === 'attendance') {
            switchTab('monitoring');
            switchMonitorTab('attendance');
            const el = document.getElementById('monitoring-tab');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
        } else if (destination === 'academics') {
            switchTab('monitoring');
            switchMonitorTab('results');
            const el = document.getElementById('monitoring-tab');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
        } else if (destination === 'reports') {
            switchTab('teacher-reports');
            const el = document.getElementById('teacher-reports-tab');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
        }
    };

    // Report Sub-tabs Logic
    window.switchReportTab = function (type) {
        const tabs = ['feedback', 'student', 'teacher'];
        tabs.forEach(t => {
            const btn = document.getElementById(`btn-report-${t}`);
            const view = document.getElementById(`view-report-${t === 'feedback' ? 'feedback' : (t === 'student' ? 'student-classwise' : 'teacher-classwise')}`);
            
            if (t === type || (type === 'student-classwise' && t === 'student') || (type === 'teacher-classwise' && t === 'teacher')) {
                if (btn) btn.className = "px-5 py-2 rounded-md bg-blue-100 text-blue-700 font-bold shadow-sm transition-all";
                if (view) view.classList.remove('hidden');
            } else {
                if (btn) btn.className = "px-5 py-2 rounded-md text-gray-600 hover:bg-gray-50 font-semibold transition-all";
                if (view) view.classList.add('hidden');
            }
        });

        if (type === 'feedback') loadTeacherReports();
        if (type === 'teacher-classwise' || type === 'teacher') displayTeacherClassReport();
    };

    // Student Class-wise Report
    window.generateStudentClassReport = function () {
        const className = document.getElementById('report-student-class-select').value;
        const tbody = document.getElementById('report-student-tbody');
        if (!className) {
            tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-8 text-center text-gray-400 italic">Select a class to view report</td></tr>';
            return;
        }

        const filtered = allStudents.filter(s => s.class === className);
        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-8 text-center text-gray-500 font-semibold">No students found in this class</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(s => `
            <tr class="border-b hover:bg-gray-50">
                <td class="px-4 py-3">${s.rollNumber || '-'}</td>
                <td class="px-4 py-3 font-bold text-blue-900">${s.studentName || '-'}</td>
                <td class="px-4 py-3">${s.fatherName || '-'}</td>
                <td class="px-4 py-3">${s.mobile || '-'}</td>
                <td class="px-4 py-3">
                    <span class="px-2 py-1 rounded-full text-xs font-bold ${s.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                        ${s.status || 'active'}
                    </span>
                </td>
            </tr>
        `).join('');
    };

    // Teacher Class-wise Report
    window.displayTeacherClassReport = function () {
        const tbody = document.getElementById('report-teacher-tbody');
        if (!tbody) return;

        if (allTeachers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-8 text-center text-gray-400">Loading teacher assignments...</td></tr>';
            return;
        }

        // Sort by assigned class
        const sortedTeachers = [...allTeachers].sort((a, b) => {
            if (!a.assignedClass) return 1;
            if (!b.assignedClass) return -1;
            return a.assignedClass.localeCompare(b.assignedClass);
        });

        tbody.innerHTML = sortedTeachers.map(t => `
            <tr class="border-b hover:bg-gray-50">
                <td class="px-4 py-3 font-bold text-blue-800">${t.assignedClass ? formatClass(t.assignedClass) : 'Not Assigned'}</td>
                <td class="px-4 py-3 font-semibold">${t.name || '-'}</td>
                <td class="px-4 py-3 text-sm">${t.subject || t.qualification || '-'}</td>
                <td class="px-4 py-3 text-sm">${t.mobile || t.email || '-'}</td>
            </tr>
        `).join('');
    };

    // Export Functions
    window.exportStudentClassReport = function () {
        const className = document.getElementById('report-student-class-select').value;
        if (!className) return alert('Please select a class first');
        const filtered = allStudents.filter(s => s.class === className);
        // Reuse export logic but for filtered list
        const headers = ['Roll No', 'Name', 'Father Name', 'Mobile', 'Status'];
        const csv = headers.join(',') + '\\n' + filtered.map(s => `"${s.rollNumber || ''}","${s.studentName || ''}","${s.fatherName || ''}","${s.mobile || ''}","${s.status || 'active'}"`).join('\\n');
        downloadCSV(csv, `student_report_${className}.csv`);
    };

    window.exportTeacherClassReport = function () {
        const headers = ['Class', 'Teacher Name', 'Subject', 'Contact'];
        const csv = headers.join(',') + '\\n' + allTeachers.map(t => `"${t.assignedClass || 'None'}","${t.name || ''}","${t.subject || ''}","${t.mobile || ''}"`).join('\\n');
        downloadCSV(csv, `teacher_class_report.csv`);
    };

    function downloadCSV(csv, filename) {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);
    }
}


// Global state for monitoring
let monitoringData = { students: [] };

// 1. Teacher Reports
async function loadTeacherReports() {
    console.log("Loading teacher reports...");
    const tbody = document.getElementById('teacher-reports-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center">Loading...</td></tr>';

    try {
        const msgsRef = collection(db, 'messages');
        // Removed orderBy to avoid needing a composite index. Sorting in client-side instead.
        const q = query(msgsRef, where('type', '==', 'teacher_report'));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">No reports found.</td></tr>';
            return;
        }

        const reports = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Sort by date descending (newest first)
        reports.sort((a, b) => new Date(b.date) - new Date(a.date));

        tbody.innerHTML = reports.map(data => {
            return `
                <tr class="border-b hover:bg-gray-50">
                    <td class="px-6 py-4 text-sm">${new Date(data.date).toLocaleDateString()}</td>
                    <td class="px-6 py-4 text-sm font-semibold">${data.fromName || 'Unknown'}</td>
                    <td class="px-6 py-4 text-sm">${data.fromClass ? 'Class ' + data.fromClass : '-'}</td>
                    <td class="px-6 py-4 text-sm">${data.subject || '-'}</td>
                    <td class="px-6 py-4 text-sm max-w-xs truncate" title="${data.message}">${data.message || '-'}</td>
                    <td class="px-6 py-4 text-center">
                        <button onclick="deleteTeacherReport('${data.id}')" class="text-red-600 hover:text-red-800 transition-colors" title="Delete Report">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error("Error loading teacher reports:", error);
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-4 text-center text-red-500">Error: ${error.message}</td></tr>`;
    }
}

window.deleteTeacherReport = async function (id) {
    if (confirm('Are you sure you want to delete this report?')) {
        const result = await firestoreHelper.deleteDocument('messages', id);
        if (result.success) {
            alert('Report deleted successfully');
            loadTeacherReports();
        } else {
            alert('Error deleting report: ' + result.error);
        }
    }
};

// 2. Class Monitoring
window.loadClassMonitoringData = async function () {
    // Check which tab is active and use the appropriate class selector
    const attView = document.getElementById('monitor-view-attendance');
    const resView = document.getElementById('monitor-view-results');

    let className;
    if (resView && !resView.classList.contains('hidden')) {
        // Results tab is active, use its class selector
        className = document.getElementById('monitor-results-class-select').value;
    } else {
        // Attendance tab is active (or default), use its class selector
        className = document.getElementById('monitor-class-select').value;
    }

    if (!className) return;

    // Fetch students for this class once
    const result = await firestoreHelper.getDocuments('students', [where('class', '==', className)]);
    if (result.success) {
        monitoringData.students = result.data;
        // Trigger reload of active view
        if (attView && !attView.classList.contains('hidden')) {
            loadClassAttendance();
        } else {
            loadClassResults();
        }
    }
};

window.loadClassAttendance = async function () {
    const className = document.getElementById('monitor-class-select').value;
    const date = document.getElementById('monitor-date').value;
    const tbody = document.getElementById('monitor-attendance-body');

    if (!className || !date) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="2" class="px-6 py-10 text-center text-gray-500 italic">Please select both class and date to view records.</td></tr>';
        return;
    }

    if (tbody) tbody.innerHTML = '<tr><td colspan="2" class="px-6 py-10 text-center text-gray-400 font-bold"><i class="fas fa-spinner fa-spin mr-2"></i>Loading Attendance...</td></tr>';

    try {
        // Fetch students for this class FIRST to ensure we have the list
        const studentRes = await firestoreHelper.getDocuments('students', [where('class', '==', className)]);
        if (!studentRes.success || studentRes.data.length === 0) {
            if (tbody) tbody.innerHTML = `<tr><td colspan="2" class="px-6 py-10 text-center text-red-500 font-bold">No students found in Class ${className.toUpperCase()}.</td></tr>`;
            return;
        }
        
        const classStudents = studentRes.data.sort((a, b) => (a.studentName || a.name || '').localeCompare(b.studentName || b.name || ''));

        const docId = `${className}_${date}`;
        const attDoc = await firestoreHelper.getDocument('attendance', docId);

        let records = {};
        if (attDoc.success) {
            records = attDoc.data.records || {};
        }

        if (tbody) {
            tbody.innerHTML = classStudents.map(student => {
                const status = records[student.id] || 'N/A';
                const statusDisplay = (status === 'present')
                    ? '<span class="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-black uppercase tracking-wider">Present</span>'
                    : (status === 'absent' 
                        ? '<span class="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-black uppercase tracking-wider">Absent</span>'
                        : '<span class="px-3 py-1 bg-gray-100 text-gray-400 rounded-full text-xs font-bold uppercase tracking-wider">Not Marked</span>');

                return `
                    <tr class="border-b hover:bg-gray-50 transition-colors">
                        <td class="px-6 py-4">
                            <div class="font-bold text-gray-900">${student.studentName || student.name}</div>
                            <div class="text-[10px] text-gray-400 uppercase tracking-tighter">Roll No: ${student.rollNumber || '---'}</div>
                        </td>
                        <td class="px-6 py-4 text-center">
                            ${statusDisplay}
                        </td>
                    </tr>
                `;
            }).join('');
        }

    } catch (e) {
        console.error(e);
    }
};

window.loadClassResults = async function () {
    const className = document.getElementById('exam-class-select')?.value;
    const examName = document.getElementById('exam-type-select')?.value;
    const tbody = document.getElementById('monitor-results-body');
    const examDisplayNames = {
        'unit1': 'Unit Test 1',
        'unit2': 'Unit Test 2',
        'half-yearly': 'Half Yearly',
        'annual': 'Annual Exam'
    };

    if (!className) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-10 text-center text-gray-500 italic">Please select a class to load students.</td></tr>';
        return;
    }

    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-10 text-center text-gray-400 font-bold"><i class="fas fa-spinner fa-spin mr-2"></i>Loading Class Records...</td></tr>';

    try {
        const result = await firestoreHelper.getDocuments('students', [where('class', '==', className)]);

        if (!result.success || result.data.length === 0) {
            if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-10 text-center text-red-500 font-bold">No students found in Class ${className.toUpperCase()}.</td></tr>`;
            return;
        }

        const examLabel = examDisplayNames[examName] || examName;

        // Create a mapping to match how the teacher saves the exam key
        const dbExamKeys = {
            'unit1': 'Unit_Test_1',
            'unit2': 'Unit_Test_2',
            'half-yearly': 'Half_Yearly',
            'annual': 'Annual'
        };

        // Step 1: Calculate total marks, percentage, and prepare for ranking
        const studentsWithStats = result.data.map(student => {
            let obtained = 0;
            let max = 0;
            let percentage = 0;
            let hasMarks = false;
            let grade = 'A';
            const examKey = dbExamKeys[examName] || examName;
            
            if (student.examMarks && student.examMarks[examKey]) {
                const data = student.examMarks[examKey];
                const results = data.results || {};
                const keys = Object.keys(results);
                if (keys.length > 0) {
                    hasMarks = true;
                    obtained = keys.reduce((sum, key) => sum + parseInt(results[key] || 0), 0);
                    max = keys.length * 100;
                    percentage = parseFloat(data.percentage || 0);
                    grade = data.grade || 'A';
                }
            }
            return {
                ...student,
                _obtained: obtained,
                _max: max,
                _percentage: percentage,
                _hasMarks: hasMarks,
                _grade: grade,
                _results: hasMarks ? student.examMarks[examKey].results : null
            };
        });

        // Step 2: Sort by percentage descending to calculate rank
        studentsWithStats.sort((a, b) => b._percentage - a._percentage);
        
        // Step 3: Assign rank
        let currentRank = 1;
        let lastPerc = null;
        let skip = 0;
        
        studentsWithStats.forEach(s => {
            if (!s._hasMarks) {
                s._rank = '-';
            } else {
                if (s._percentage === lastPerc) {
                    s._rank = currentRank;
                    skip++;
                } else {
                    currentRank += skip;
                    s._rank = currentRank;
                    skip = 1;
                    lastPerc = s._percentage;
                }
            }
        });

        // Store globally for the modal to use
        window._currentClassResults = studentsWithStats;
        window._currentExamLabel = examLabel;

        // Step 4: Sort alphabetically for display
        studentsWithStats.sort((a, b) => (a.studentName || a.name || '').localeCompare(b.studentName || b.name || ''));

        if (tbody) {
            tbody.innerHTML = studentsWithStats.map(student => {
                let marksHtml = '-';
                let gradeHtml = '-';

                if (student._hasMarks) {
                    marksHtml = `<div class="font-black text-blue-900 leading-tight">${student._obtained}/${student._max} <span class="text-xs text-gray-500 font-bold">(${student._percentage}%)</span></div>`;
                    gradeHtml = `Grade: <span class="text-green-700">${student._grade}</span> | Rank: <span class="text-blue-700">${student._rank}</span>`;
                }

                return `
                    <tr class="border-b hover:bg-gray-50 transition-colors">
                        <td class="px-6 py-4">
                            <div class="font-black text-gray-900">${student.studentName || student.name}</div>
                            <div class="text-[10px] text-gray-400 font-mono tracking-tighter uppercase">ID: ${student.id.substring(0, 8)}</div>
                        </td>
                        <td class="px-6 py-4 text-center">
                            <span class="text-xs font-bold px-3 py-1 bg-gray-100 text-gray-600 rounded-lg uppercase tracking-wider">${examLabel}</span>
                        </td>
                        <td class="px-6 py-4 text-center">
                            ${marksHtml !== '-' ? marksHtml : '<div class="text-sm font-bold text-gray-400">-</div>'}
                            ${gradeHtml !== '-' ? `<div class="text-[10.5px] font-bold text-gray-500 uppercase mt-1 tracking-tight">${gradeHtml}</div>` : ''}
                        </td>
                        <td class="px-6 py-4 text-center">
                            <button onclick="viewAcademicResult('${student.id}', '${examName}')" class="bg-blue-900 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-800 transition-all shadow-sm">
                                <i class="fas fa-chart-line mr-1"></i>View Result
                            </button>
                        </td>
                        <td class="px-6 py-4 text-center">
                            <button onclick="generateAdmitCard('${student.id}', '${examName}')" class="bg-blue-50 text-blue-900 border border-blue-200 px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-100 transition-all shadow-sm">
                                <i class="fas fa-id-card mr-1"></i>Print Admit Card
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    } catch (error) {
        console.error('Error loading results:', error);
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-red-500">Error loading results</td></tr>';
    }
};

async function loadAllData() {
    // Some pages reuse this module but don't include every dashboard section.
    // Use allSettled so one missing section doesn't prevent others from loading.
    await Promise.allSettled([
        loadAdmissions(),
        loadStudents(),
        loadTeachers(),
        loadMessages(),
        loadNotifications()
    ]);
    updateStats();
    if (typeof loadRecentFees === 'function') loadRecentFees();
}

// ========== STUDENTS MANAGEMENT ==========

async function loadStudents() {
    console.log('Loading students progressively...');
    const tbody = document.getElementById('students-table-body');
    // Some pages (like admin-dashboard.html) don't include the students table,
    // but still need the student list (e.g. Fee Collection modal).
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-8 text-center text-gray-500"><div class="flex flex-col items-center"><i class="fas fa-spinner fa-spin text-3xl mb-3 text-blue-600"></i><span>Loading students...</span></div></td></tr>';
    }

    allStudents = [];
    let lastDoc = null;
    let hasMore = true;
    let isFirstChunk = true;

    try {
        while (hasMore) {
            // Load chunk
            const result = await firestoreHelper.getPaginatedData('students', 20, lastDoc);

            if (result.success) {
                const chunk = result.data;
                lastDoc = result.lastDoc;
                hasMore = result.hasMore;

                if (isFirstChunk) {
                    // Clear loading message and render first chunk
                    if (tbody) tbody.innerHTML = '';
                    allStudents = chunk;
                    window.allStudents = allStudents;
                    if (tbody) displayStudents(chunk, false); // append = false (replace)
                    isFirstChunk = false;
                } else {
                    // Append subsequent chunks
                    allStudents = [...allStudents, ...chunk];
                    if (tbody) displayStudents(chunk, true); // append = true
                }

                // If it's the very first chunk and empty
                if (allStudents.length === 0) {
                    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-8 text-center text-gray-500">No students found</td></tr>';
                    return;
                }

                // Small delay to allow UI to update and not block main thread
                if (hasMore) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            } else {
                console.error("Error loading students chunk:", result.error);
                hasMore = false;
                if (isFirstChunk && tbody) {
                    tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-red-500">Error: ${result.error}</td></tr>`;
                }
            }
        }
    } catch (error) {
        console.error("Critical error in loadStudents:", error);
    }
}

function displayStudents(students, append = false) {
    const tbody = document.getElementById('students-table-body');

    const rowsHtml = students.map(student => `
        <tr class="border-b hover:bg-gray-50 animate-fade-in">
            <td class="px-6 py-4">
                <img src="${student.photo || '../assets/images/logo.png'}" alt="Student" 
                     class="w-10 h-10 rounded-full object-cover border border-gray-200"
                     loading="lazy">
            </td>
            <td class="px-6 py-4">${student.admissionId || student.rollNumber || 'N/A'}</td>
            <td class="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors group" onclick="openRollNoModal('${student.id}', '${student.rollNumber || ''}')" title="Click to Edit Roll No">
                <div class="flex items-center gap-2">
                    <span class="font-bold text-blue-900">${student.rollNumber !== student.admissionId ? (student.rollNumber || '-') : '-'}</span>
                    <i class="fas fa-pencil-alt text-xs text-gray-400 group-hover:text-blue-600"></i>
                </div>
            </td>
            <td class="px-6 py-4 font-semibold">${student.studentName || 'N/A'}</td>
            <td class="px-6 py-4">${formatClass(student.class)}</td>
            <td class="px-6 py-4">${student.fatherName || 'N/A'}</td>
            <td class="px-6 py-4">${student.mobile || 'N/A'}</td>
            <td class="px-6 py-4">
                <span class="px-3 py-1 rounded-full text-xs font-semibold ${student.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                    ${student.status || 'active'}
                </span>
            </td>
            <td class="px-6 py-4 text-center">
                <button onclick="window.open('print-student.html?id=${student.id}', '_blank')" class="text-green-600 hover:text-green-800 mr-3" title="Download Form PDF">
                    <i class="fas fa-file-pdf"></i>
                </button>
                <button onclick="editStudent('${student.id}')" class="text-blue-600 hover:text-blue-800 mr-3" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="deleteStudent('${student.id}')" class="text-red-600 hover:text-red-800" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');

    if (append) {
        tbody.insertAdjacentHTML('beforeend', rowsHtml);
    } else {
        tbody.innerHTML = rowsHtml;
    }
}

window.openAddStudentModal = function () {
    // Redirect to admission form with source parameter
    window.location.href = 'admission.html?source=admin';
};

window.closeStudentModal = function () {
    document.getElementById('student-modal').classList.add('hidden');
    currentEditingStudent = null;
};

window.editStudent = async function (id) {
    // Redirect to admission form with student ID for editing
    window.location.href = `admission.html?source=admin&studentId=${id}`;
};

window.handleStudentSubmit = async function (e) {
    e.preventDefault();

    const studentData = {
        studentName: document.getElementById('student-name').value,
        rollNumber: document.getElementById('student-roll').value,
        class: document.getElementById('student-class').value,
        dob: document.getElementById('student-dob').value,
        gender: document.getElementById('student-gender').value,
        fatherName: document.getElementById('student-father').value,
        motherName: document.getElementById('student-mother').value,
        mobile: document.getElementById('student-mobile').value,
        email: document.getElementById('student-email').value,
        address: document.getElementById('student-address').value,
        updatedAt: new Date().toISOString()
    };

    // Handle File Upload
    const photoFile = document.getElementById('student-photo').files[0];
    if (photoFile) {
        const uploadResult = await storageHelper.uploadFile(photoFile, `students/${Date.now()}_${photoFile.name}`);
        if (uploadResult.success) {
            studentData.photo = uploadResult.url;
        } else {
            alert('Failed to upload photo: ' + uploadResult.error);
            return;
        }
    }

    const studentId = document.getElementById('student-id').value;

    if (studentId) {
        // Update existing student
        const result = await firestoreHelper.updateDocument('students', studentId, studentData);
        if (result.success) {
            alert('Student updated successfully!');
            closeStudentModal();
            await loadStudents();
        } else {
            alert('Error updating student: ' + result.error);
        }
    } else {
        // Add new student
        studentData.createdAt = new Date().toISOString();
        const result = await firestoreHelper.addDocument('students', studentData);
        if (result.success) {
            alert('Student added successfully!');
            closeStudentModal();
            await loadStudents();
        } else {
            alert('Error adding student: ' + result.error);
        }
    }
}

window.deleteStudent = async function (id) {
    if (!confirm('Are you sure you want to delete this student?')) return;

    const result = await firestoreHelper.deleteDocument('students', id);
    if (result.success) {
        alert('Student deleted successfully!');
        await loadStudents();
    } else {
        alert('Error deleting student: ' + result.error);
    }
};

window.searchStudents = function () {
    const query = document.getElementById('student-search').value.toLowerCase();
    const classFilter = document.getElementById('class-filter').value;

    let filtered = allStudents;

    if (classFilter !== 'all') {
        filtered = filtered.filter(s => s.class === classFilter);
    }

    if (query) {
        filtered = filtered.filter(s =>
            (s.studentName && s.studentName.toLowerCase().includes(query)) ||
            (s.rollNumber && s.rollNumber.toLowerCase().includes(query)) ||
            (s.mobile && s.mobile.includes(query))
        );
    }

    displayStudents(filtered);
};

window.filterStudents = function () {
    searchStudents(); // Reuse search function
};

window.exportStudents = function () {
    if (allStudents.length === 0) {
        alert('No students to export!');
        return;
    }

    // Create CSV
    const headers = ['Serial No', 'Roll No', 'Name', 'Class', 'DOB', 'Gender', 'Father Name', 'Mother Name', 'Mobile', 'Email', 'Address', 'Status'];
    const rows = allStudents.map(s => [
        s.admissionId || '',
        s.rollNumber !== s.admissionId ? (s.rollNumber || '') : '',
        s.studentName || '',
        formatClass(s.class),
        s.dob || '',
        s.gender || '',
        s.fatherName || '',
        s.motherName || '',
        s.mobile || '',
        s.email || '',
        s.address || '',
        s.status || ''
    ]);

    let csv = headers.join(',') + '\\n';
    rows.forEach(row => {
        csv += row.map(field => `"${field}"`).join(',') + '\\n';
    });

    // Download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `students_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
};

// ========== TEACHERS MANAGEMENT ==========

async function loadTeachers() {
    console.log('Loading teachers progressively...');
    const tbody = document.getElementById('teachers-table-body');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-8 text-center text-gray-500"><div class="flex flex-col items-center"><i class="fas fa-spinner fa-spin text-3xl mb-3 text-blue-600"></i><span>Loading teachers...</span></div></td></tr>';
    }

    allTeachers = [];
    let lastDoc = null;
    let hasMore = true;
    let isFirstChunk = true;

    try {
        while (hasMore) {
            // Load chunk
            const result = await firestoreHelper.getPaginatedData('teachers', 20, lastDoc);

            if (result.success) {
                const chunk = result.data;
                lastDoc = result.lastDoc;
                hasMore = result.hasMore;

                if (isFirstChunk) {
                    // Clear loading message and render first chunk
                    if (tbody) tbody.innerHTML = '';
                    allTeachers = chunk;
                    window.allTeachers = allTeachers;
                    if (tbody) displayTeachers(chunk, false); // append = false
                    isFirstChunk = false;
                } else {
                    // Append chunks
                    allTeachers = [...allTeachers, ...chunk];
                    window.allTeachers = allTeachers;
                    if (tbody) displayTeachers(chunk, true); // append = true
                }

                if (allTeachers.length === 0) {
                    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-8 text-center text-gray-500">No teachers found</td></tr>';
                    return;
                }

                if (hasMore) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            } else {
                console.error("Error loading teachers chunk:", result.error);
                hasMore = false;
                if (isFirstChunk) {
                    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-red-500">Error: ${result.error}</td></tr>`;
                }
            }
        }
    } catch (error) {
        console.error("Critical error in loadTeachers:", error);
    }
}

function displayTeachers(teachers, append = false) {
    const tbody = document.getElementById('teachers-table-body');

    const rowsHtml = teachers.map(teacher => `
        <tr class="border-b hover:bg-gray-50 animate-fade-in">
            <td class="px-6 py-4">
                <img src="${teacher.photo || '../assets/images/logo.png'}" alt="Teacher" 
                     class="w-10 h-10 rounded-full object-cover border border-gray-200"
                     loading="lazy">
            </td>
            <td class="px-6 py-4 font-semibold">${teacher.name || 'N/A'}</td>
            <td class="px-6 py-4">${teacher.email || 'N/A'}</td>
            <td class="px-6 py-4">${teacher.mobile || 'N/A'}</td>
            <td class="px-6 py-4 font-semibold">${teacher.subject || 'N/A'}</td>
            <td class="px-6 py-4 font-bold text-green-700">₹${teacher.salary || 0}</td>
            <td class="px-6 py-4">
                ${teacher.assignedClass ? `<span class="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">${formatClass(teacher.assignedClass)}</span>` : '-'}
            </td>
            <td class="px-6 py-4">
                <span class="px-3 py-1 rounded-full text-xs font-semibold ${teacher.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                    ${teacher.status || 'active'}
                </span>
            </td>
            <td class="px-6 py-4 text-center">
                <button onclick="editTeacher('${teacher.id}')" class="text-blue-600 hover:text-blue-800 mr-3" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="generateSalarySlip('${teacher.id}')" class="text-green-600 hover:text-green-800 mr-3" title="Generate Salary Slip">
                    <i class="fas fa-file-invoice-dollar"></i>
                </button>
                <button onclick="deleteTeacher('${teacher.id}')" class="text-red-600 hover:text-red-800" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');

    if (append) {
        tbody.insertAdjacentHTML('beforeend', rowsHtml);
    } else {
        tbody.innerHTML = rowsHtml;
    }
}

// Generate Salary Slip Placeholder
window.generateSalarySlip = function (id) {
    const teacher = allTeachers.find(t => t.id === id);
    if (!teacher) return;
    alert(`Generating Salary Slip for ${teacher.name}... (Feature coming soon)`);
}

// Global Preview Function
window.previewImage = function (input, previewId) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            document.getElementById(previewId).src = e.target.result;
        }
        reader.readAsDataURL(input.files[0]);
    }
};




// Duplicate editStudent function removed - using the complete version at line 393

window.handleStudentSubmit = async function (e) {
    e.preventDefault();

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Processing...';

    try {
        const studentData = {
            rollNumber: document.getElementById('student-roll').value,
            studentName: document.getElementById('student-name').value,
            class: document.getElementById('student-class').value,
            dob: document.getElementById('student-dob').value,
            gender: document.getElementById('student-gender').value,
            fatherName: document.getElementById('student-father').value,
            motherName: document.getElementById('student-mother').value,
            mobile: document.getElementById('student-mobile').value,
            email: document.getElementById('student-email').value,
            address: document.getElementById('student-address').value,
            admissionDate: document.getElementById('student-admission-date').value,
            updatedAt: new Date().toISOString()
        };

        const studentId = document.getElementById('student-id').value;
        const photoFile = document.getElementById('student-photo').files[0];

        // Handle File Upload
        if (photoFile) {
            const uploadResult = await storageHelper.uploadFile(photoFile, `students/${Date.now()}_${photoFile.name}`);
            if (uploadResult.success) {
                studentData.photo = uploadResult.url;
            } else {
                throw new Error('Failed to upload photo: ' + uploadResult.error);
            }
        }

        let result;
        if (studentId) {
            result = await firestoreHelper.updateDocument('students', studentId, studentData);
        } else {
            studentData.createdAt = new Date().toISOString();
            result = await firestoreHelper.addDocument('students', studentData);
        }

        if (result.success) {
            // Show success UI immediately without alert blocking
            const successMsg = document.createElement('div');
            successMsg.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-xl z-50 animate-bounce';
            successMsg.innerHTML = '<i class="fas fa-check-circle mr-2"></i>Saved Successfully!';
            document.body.appendChild(successMsg);

            setTimeout(() => successMsg.remove(), 3000);

            document.getElementById('student-modal').classList.add('hidden');
            loadStudents();
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
    }
};

window.openAddTeacherModal = function () {
    currentEditingTeacher = null;
    document.getElementById('teacher-modal-title').textContent = 'Add Teacher';
    document.getElementById('teacher-form').reset();
    document.getElementById('teacher-id').value = '';
    document.getElementById('teacher-preview').src = '../assets/images/logo.png'; // Reset preview
    document.getElementById('teacher-modal').classList.remove('hidden');
};

window.editTeacher = async function (id) {
    const teacher = allTeachers.find(t => t.id === id);
    if (!teacher) return;

    currentEditingTeacher = teacher;
    document.getElementById('teacher-modal-title').textContent = 'Edit Teacher';
    document.getElementById('teacher-id').value = teacher.id;
    document.getElementById('teacher-name').value = teacher.name || '';
    document.getElementById('teacher-email').value = teacher.email || '';
    document.getElementById('teacher-mobile').value = teacher.mobile || '';
    document.getElementById('teacher-qualification').value = teacher.qualification || '';
    document.getElementById('teacher-subject').value = teacher.subject || '';
    document.getElementById('teacher-assigned-class').value = teacher.assignedClass || '';
    document.getElementById('teacher-joining-date').value = teacher.joiningDate || '';
    document.getElementById('teacher-salary').value = teacher.salary || '';
    document.getElementById('teacher-preview').src = teacher.photo || '../assets/images/logo.png'; // Set preview

    document.getElementById('teacher-modal').classList.remove('hidden');
};

window.handleTeacherSubmit = async function (e) {
    e.preventDefault();

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Processing...';

    try {
        const teacherData = {
            name: document.getElementById('teacher-name').value,
            email: document.getElementById('teacher-email').value,
            mobile: document.getElementById('teacher-mobile').value,
            qualification: document.getElementById('teacher-qualification').value,
            subject: document.getElementById('teacher-subject').value,
            assignedClass: document.getElementById('teacher-assigned-class').value,
            salary: parseFloat(document.getElementById('teacher-salary').value) || 0,
            joiningDate: document.getElementById('teacher-joining-date').value,
            status: 'active',
            updatedAt: new Date().toISOString()
        };

        const password = document.getElementById('teacher-password').value;
        const teacherId = document.getElementById('teacher-id').value;
        const photoFile = document.getElementById('teacher-photo').files[0];

        // Handle File Upload
        if (photoFile) {
            const uploadResult = await storageHelper.uploadFile(photoFile, `teachers/${Date.now()}_${photoFile.name}`);
            if (uploadResult.success) {
                teacherData.photo = uploadResult.url;
            } else {
                throw new Error('Failed to upload photo: ' + uploadResult.error);
            }
        }

        if (teacherId) {
            // Update existing teacher
            const result = await firestoreHelper.updateDocument('teachers', teacherId, teacherData);
            if (result.success) {
                showSuccessToast('Teacher updated successfully!');
                closeTeacherModal();
                loadTeachers(); // Don't await, let it load in background
            } else {
                throw new Error('Error updating teacher: ' + result.error);
            }
        } else {
            // Add new teacher AND Create Auth Account
            if (!password) {
                throw new Error('Password is required for new teachers!');
            }

            teacherData.createdAt = new Date().toISOString();

            // 1. Create Auth Account
            const authResult = await authHelper.createSecondaryAccount(teacherData.email, password, {
                name: teacherData.name,
                role: 'teacher'
            });

            if (authResult.success) {
                // 2. Add to 'teachers' collection with the real UID
                teacherData.uid = authResult.uid;
                const result = await firestoreHelper.addDocument('teachers', teacherData);

                if (result.success) {
                    showSuccessToast('Teacher Account Created!');
                    closeTeacherModal();
                    loadTeachers();
                } else {
                    throw new Error('Account created but failed to save profile: ' + result.error);
                }
            } else {
                throw new Error('Error creating login account: ' + authResult.error);
            }
        }
    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
    }
}

// Helper for consistency
function showSuccessToast(message) {
    const successMsg = document.createElement('div');
    successMsg.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-xl z-50 animate-bounce';
    successMsg.innerHTML = `<i class="fas fa-check-circle mr-2"></i>${message}`;
    document.body.appendChild(successMsg);
    setTimeout(() => successMsg.remove(), 3000);
}

// Global notification wrapper
window.showNotification = function(message, type = 'success') {
    if (type === 'success') {
        showSuccessToast(message);
    } else if (type === 'error') {
        alert('Error: ' + message);
    } else {
        console.log(`Notification [${type}]: ${message}`);
        // Simple info toast for others
        const infoMsg = document.createElement('div');
        infoMsg.className = 'fixed top-4 right-4 bg-blue-500 text-white px-6 py-3 rounded-lg shadow-xl z-50';
        infoMsg.innerHTML = `<i class="fas fa-info-circle mr-2"></i>${message}`;
        document.body.appendChild(infoMsg);
        setTimeout(() => infoMsg.remove(), 3000);
    }
};

window.deleteTeacher = async function (id) {
    if (!confirm('Are you sure you want to delete this teacher?')) return;

    const result = await firestoreHelper.deleteDocument('teachers', id);
    if (result.success) {
        alert('Teacher deleted successfully!');
        await loadTeachers();
    } else {
        alert('Error deleting teacher: ' + result.error);
    }
};

window.searchTeachers = function () {
    const query = document.getElementById('teacher-search').value.toLowerCase();

    const filtered = allTeachers.filter(t =>
        (t.name && t.name.toLowerCase().includes(query)) ||
        (t.email && t.email.toLowerCase().includes(query)) ||
        (t.mobile && t.mobile.includes(query)) ||
        (t.subject && t.subject.toLowerCase().includes(query))
    );

    displayTeachers(filtered);
};

// ========== ADMISSIONS MANAGEMENT ==========

async function loadAdmissions() {
    console.log('Loading admissions progressively...');
    const container = document.getElementById('admissions-list');
    if (!container) return;
    container.innerHTML = '<div class="text-gray-500 text-center py-8"><i class="fas fa-spinner fa-spin text-2xl mb-2 text-blue-600"></i><p>Loading admissions...</p></div>';

    allAdmissions = [];
    let lastDoc = null;
    let hasMore = true;
    let isFirstChunk = true;

    try {
        while (hasMore) {
            const result = await firestoreHelper.getPaginatedData('admissions', 15, lastDoc, 'submittedAt');

            if (result.success) {
                const chunk = result.data;
                lastDoc = result.lastDoc;
                hasMore = result.hasMore;

                // Stop if no data returned
                if (result.data.length === 0) {
                    hasMore = false;
                }

                if (isFirstChunk) {
                    // container.innerHTML = ''; // Don't clear here, let displayAdmissions handle it or clear before loop
                    allAdmissions = chunk;

                    // Filter based on current dropdown selection
                    const currentFilter = document.getElementById('admission-filter').value;
                    const filteredChunk = currentFilter === 'all' ? chunk : chunk.filter(a => a.status === currentFilter);

                    if (filteredChunk.length > 0) {
                        displayAdmissions(filteredChunk, false);
                    } else {
                        document.getElementById('admissions-list').innerHTML = `<p class="text-gray-500 text-center py-8">No ${currentFilter !== 'all' ? currentFilter : ''} admissions found</p>`;
                    }

                    displayRecentActivity();
                    isFirstChunk = false;
                } else {
                    allAdmissions = [...allAdmissions, ...chunk];

                    // Filter based on current dropdown selection
                    const currentFilter = document.getElementById('admission-filter').value;
                    const filteredChunk = currentFilter === 'all' ? chunk : chunk.filter(a => a.status === currentFilter);

                    if (filteredChunk.length > 0) {
                        displayAdmissions(filteredChunk, true);
                    }
                }

                if (allAdmissions.length === 0) {
                    document.getElementById('admissions-list').innerHTML = '<p class="text-gray-500 text-center py-8">No admissions found</p>';
                    return;
                }

                if (hasMore) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            } else {
                console.error("Error loading admissions chunk:", result.error);
                hasMore = false;
                if (isFirstChunk) {
                    document.getElementById('admissions-list').innerHTML = `<p class="text-red-500 text-center py-8">Error: ${result.error}</p>`;
                }
            }
        }
    } catch (error) {
        console.error("Critical error in loadAdmissions:", error);
    }
}

function displayAdmissions(admissions, append = false) {
    const container = document.getElementById('admissions-list');

    const html = admissions.map(admission => `
        <div class="bg-white border-2 border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow animate-fade-in block mb-4">
            <div class="flex justify-between items-start mb-4">
                <div class="flex-1">
                    <h4 class="text-lg font-bold text-gray-800">${admission.student_name || 'N/A'}</h4>
                    <div class="grid grid-cols-2 gap-2 mt-2 text-sm text-gray-600">
                        <p><i class="fas fa-graduation-cap mr-2"></i>Class: ${admission.class || 'N/A'}</p>
                        <p><i class="fas fa-calendar mr-2"></i>DOB: ${admission.dob ? admission.dob.split('-').reverse().join('/') : 'N/A'}</p>
                        <p><i class="fas fa-phone mr-2"></i>${admission.mobile || 'N/A'}</p>
                        <p><i class="fas fa-envelope mr-2"></i>${admission.email || 'N/A'}</p>
                    </div>
                    <p class="text-sm text-gray-600 mt-2"><i class="fas fa-user mr-2"></i>Father: ${admission.father_name || 'N/A'}</p>
                </div>
                <div class="text-right ml-4">
                    <span class="px-3 py-1 rounded-full text-xs font-semibold ${admission.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
            admission.status === 'approved' ? 'bg-green-100 text-green-800' :
                'bg-red-100 text-red-800'
        }">
                        ${admission.status || 'pending'}
                    </span>
                    <p class="text-xs text-gray-500 mt-2">
                        ${new Date(admission.submittedAt || admission.createdAt).toLocaleDateString('hi-IN')}
                    </p>
                </div>
            </div>
            <div class="flex gap-2">
                ${admission.status === 'pending' ? `
                    <button onclick="updateAdmissionStatus('${admission.id}', 'approved')" 
                        class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm">
                        <i class="fas fa-check mr-1"></i>Approve
                    </button>
                    <button onclick="updateAdmissionStatus('${admission.id}', 'rejected')" 
                        class="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-sm">
                        <i class="fas fa-times mr-1"></i>Reject
                    </button>
                ` : ''}
                <button onclick="viewAdmissionDetails('${admission.id}')" 
                    class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
                    <i class="fas fa-eye mr-1"></i>View Details
                </button>
            </div>
        </div>
    `).join('');

    if (append) {
        container.insertAdjacentHTML('beforeend', html);
    } else {
        container.innerHTML = html;
    }
}

window.updateAdmissionStatus = async function (id, status) {
    if (!confirm(`Are you sure you want to ${status} this application?`)) return;

    const result = await firestoreHelper.updateDocument('admissions', id, { status });
    if (result.success) {
        // If approved, create student record
        if (status === 'approved') {
            const admission = allAdmissions.find(a => a.id === id);
            if (admission) {
                await createStudentFromAdmission(admission);
            }
        }
        alert(`Application ${status} successfully!`);
        await loadAdmissions();
        await loadStudents();
    } else {
        alert('Error updating status: ' + result.error);
    }
};

async function createStudentFromAdmission(admission) {
    const studentData = {
        studentName: admission.student_name,
        rollNumber: '', // Manual assignment required
        serialNumber: admission.id, // Display ID (PMS-XXXXX)
        class: admission.class,
        dob: admission.dob,
        gender: admission.gender || '',
        fatherName: admission.father_name,
        fatherOccupation: admission.father_occupation || '',
        fatherCompany: admission.father_company || '', // key from form submission
        fatherPost: admission.father_post || '',
        motherName: admission.mother_name,
        motherOccupation: admission.mother_occupation || '',
        mobile: admission.mobile,
        email: admission.email,
        address: admission.address,
        postalAddress: admission.postal_address || '', // check admission keys
        guardianName: admission.guardian_name || '',
        guardianAddress: admission.guardian_address || '',
        guardianRelation: admission.guardian_relation || '',
        lastSchool: admission.lastInst || admission.last_school || '',
        motherTongue: admission.tongue || admission.mother_tongue || '',
        religion: admission.religion || '',
        durationOfStay: admission.stayUp || admission.duration_of_stay || '',

        // Documents
        photo: admission.documents?.photo || '',
        birthCertificate: admission.documents?.birthCertificate || '',
        aadharCard: admission.documents?.aadharCard || '',
        casteCert: admission.documents?.casteCert || '',
        domicileCert: admission.documents?.domicileCert || '',

        admissionId: admission.id, // Link back to admission
        status: 'active',
        createdAt: new Date().toISOString()
    };

    await firestoreHelper.addDocument('students', studentData);
}

// Admission Modal Functions
window.closeAdmissionModal = function () {
    document.getElementById('admission-modal').classList.add('hidden');
};

window.viewAdmissionDetails = function (id) {
    // Check for mobile device (width < 768px)
    if (window.innerWidth < 768) {
        // Create toast element
        const toast = document.createElement('div');
        // Added style z-index explicitly to ensure it overrides everything
        toast.style.zIndex = '999999';
        toast.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-90 text-white px-6 py-4 rounded-full shadow-2xl text-center min-w-[280px] animate-fade-in flex items-center justify-center gap-3 border border-gray-700 backdrop-blur-sm';
        toast.innerHTML = `
            <i class="fas fa-desktop text-yellow-400 text-xl"></i>
            <div>
                <p class="font-bold text-sm">कृपया डेस्कटॉप मोड ऑन करें</p>
            </div>
        `;
        document.body.appendChild(toast);

        // Remove after 3 seconds
        setTimeout(() => {
            toast.classList.add('opacity-0', 'transition-opacity', 'duration-500');
            setTimeout(() => toast.remove(), 500);
        }, 3000);

        // Continue to open modal (removed return)
    }

    const admission = allAdmissions.find(a => a.id === id);
    if (!admission) return;

    // Populate Fields
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val || '-';
    };

    set('preview-name', admission.student_name);
    set('preview-class', admission.class);
    set('preview-dob', admission.dob ? admission.dob.split('-').reverse().join('/') : 'N/A');
    set('preview-father', admission.father_name);
    set('preview-father-occ', admission.father_occupation);
    set('preview-mother', admission.mother_name);
    set('preview-mother-occ', admission.mother_occupation);
    set('preview-mobile', admission.mobile);
    set('preview-email', admission.email);
    set('preview-address', admission.address);
    set('preview-prev-school', admission.previous_school || 'N/A');

    // Status Banner Updates
    const statusSpan = document.getElementById('modal-status');
    const banner = document.getElementById('modal-status-banner');
    statusSpan.textContent = (admission.status || 'Pending').toUpperCase();

    // Style banner based on status
    banner.className = `p-4 rounded-lg border-l-4 mb-6 flex justify-between items-center ${admission.status === 'approved' ? 'bg-green-100 border-green-500 text-green-800' :
        admission.status === 'rejected' ? 'bg-red-100 border-red-500 text-red-800' :
            'bg-yellow-100 border-yellow-500 text-yellow-800'
        }`;

    // Images
    const docs = admission.documents || {};
    const setupImg = (imgId, linkId, url, defaultText) => {
        const img = document.getElementById(imgId);
        const link = document.getElementById(linkId);
        
        if (!img) return; // Exit if image element doesn't exist

        if (url) {
            img.src = url;
            if (link) {
                link.href = url;
                link.classList.remove('pointer-events-none', 'opacity-50');
            }
        } else {
            img.src = '../assets/images/logo/logo.png';
            if (link) {
                link.removeAttribute('href');
                link.classList.add('pointer-events-none', 'opacity-50');
            }
        }
    };

    setupImg('preview-photo', 'preview-photo', docs.photo); // Photo is just an img, no link wrapper in my HTML but I'll fix if needed. Actually photo is raw img.
    // Correction for photo:
    const photoImg = document.getElementById('preview-photo');
    if (docs.photo) photoImg.src = docs.photo;
    else photoImg.src = '../assets/images/logo/logo.png';

    setupImg('preview-img-birth', 'preview-link-birth', docs.birthCertificate);
    setupImg('preview-img-aadhar', 'preview-link-aadhar', docs.aadharCard);

    // Actions
    const bottomActions = document.getElementById('modal-actions-bottom');
    const topActions = document.getElementById('modal-actions-top');

    // Clear previous actions
    bottomActions.innerHTML = '';
    topActions.innerHTML = '';

    const closeBtn = `<button onclick="closeAdmissionModal()" class="px-6 py-2 rounded-lg bg-gray-500 hover:bg-gray-600 font-bold text-white">Close Preview</button>`;

    if (admission.status === 'pending') {
        const actions = `
            <div class="flex gap-4">
                <button onclick="updateAdmissionStatus('${admission.id}', 'rejected'); closeAdmissionModal()" 
                    class="px-6 py-2 rounded-lg bg-red-600 hover:bg-red-700 font-bold text-white shadow-md">
                    <i class="fas fa-times mr-2"></i>Reject Application
                </button>
                <button onclick="updateAdmissionStatus('${admission.id}', 'approved'); closeAdmissionModal()" 
                    class="px-6 py-2 rounded-lg bg-green-600 hover:bg-green-700 font-bold text-white shadow-md">
                    <i class="fas fa-check mr-2"></i>Approve & Admit
                </button>
            </div>
        `;
        bottomActions.innerHTML = closeBtn + actions;
        topActions.innerHTML = `<span class="bg-blue-600 text-white text-xs px-2 py-1 rounded">Action Required</span>`;
    } else {
        bottomActions.innerHTML = closeBtn;
    }

    document.getElementById('admission-modal').classList.remove('hidden');
};

window.filterAdmissions = function () {
    const filter = document.getElementById('admission-filter').value;
    const filtered = filter === 'all' ? allAdmissions : allAdmissions.filter(a => a.status === filter);
    displayAdmissions(filtered);
};

function displayRecentActivity() {
    const container = document.getElementById('recent-activity');
    const recent = allAdmissions.slice(0, 5);

    if (recent.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-8">No recent activity</p>';
        return;
    }

    container.innerHTML = recent.map(admission => `
        <div class="border-b pb-3">
            <div class="flex justify-between items-start">
                <div>
                    <p class="font-semibold text-gray-800">${admission.student_name || 'N/A'}</p>
                    <p class="text-sm text-gray-600">Applied for Class ${admission.class || 'N/A'}</p>
                </div>
                <span class="px-3 py-1 rounded-full text-xs font-semibold ${admission.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
            admission.status === 'approved' ? 'bg-green-100 text-green-800' :
                'bg-red-100 text-red-800'
        }">
                    ${admission.status || 'pending'}
                </span>
            </div>
        </div>
    `).join('');
}

// ========== MESSAGES MANAGEMENT ==========

async function loadMessages() {
    console.log('Loading messages progressively...');
    const container = document.getElementById('messages-list');
    if (!container) return;
    container.innerHTML = '<div class="text-gray-500 text-center py-8"><i class="fas fa-spinner fa-spin text-2xl mb-2 text-blue-600"></i><p>Loading messages...</p></div>';

    allMessages = [];
    let lastDoc = null;
    let hasMore = true;
    let isFirstChunk = true;

    try {
        while (hasMore) {
            const result = await firestoreHelper.getPaginatedData('contacts', 25, lastDoc);

            if (result.success) {
                const chunk = result.data;
                lastDoc = result.lastDoc;
                hasMore = result.hasMore;

                if (isFirstChunk) {
                    container.innerHTML = '';
                    allMessages = chunk;
                    displayMessages(chunk, false);
                    isFirstChunk = false;
                } else {
                    allMessages = [...allMessages, ...chunk];
                    displayMessages(chunk, true);
                }

                if (allMessages.length === 0) {
                    container.innerHTML = '<p class="text-gray-500 text-center py-8">No messages yet</p>';
                    return;
                }

                if (hasMore) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            } else {
                console.error("Error loading messages chunk:", result.error);
                hasMore = false;
                if (isFirstChunk) {
                    container.innerHTML = `<p class="text-red-500 text-center py-8">Error: ${result.error}</p>`;
                }
            }
        }
    } catch (error) {
        console.error("Critical error in loadMessages:", error);
    }
}

function displayMessages(messages, append = false) {
    const container = document.getElementById('messages-list');

    const html = messages.map(msg => `
        <div class="bg-white border-2 border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow animate-fade-in block mb-4 ${!msg.read ? 'border-l-4 border-l-blue-600' : ''}">
            <div class="flex justify-between items-start mb-3">
                <div class="flex-1">
                    <h4 class="font-bold text-gray-800">${msg.name || 'Anonymous'}</h4>
                    <p class="text-sm text-gray-600">
                        <i class="fas fa-envelope mr-2"></i>${msg.email || 'N/A'}
                        <i class="fas fa-phone ml-4 mr-2"></i>${msg.phone || 'N/A'}
                    </p>
                </div>
                <div class="text-right">
                    ${!msg.read ? '<span class="bg-blue-600 text-white px-2 py-1 rounded text-xs">New</span>' : ''}
                    <p class="text-xs text-gray-500 mt-1">
                        ${new Date(msg.createdAt).toLocaleDateString('hi-IN')}
                    </p>
                </div>
            </div>
            <p class="text-gray-700 mb-3">${msg.message || 'No message'}</p>
            <div class="flex gap-2">
                ${!msg.read ? `
                    <button onclick="markAsRead('${msg.id}')" 
                        class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm">
                        <i class="fas fa-check mr-1"></i>Mark as Read
                    </button>
                ` : ''}
                <button onclick="deleteMessage('${msg.id}')" 
                    class="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-sm">
                    <i class="fas fa-trash mr-1"></i>Delete
                </button>
            </div>
        </div>
    `).join('');

    if (append) {
        container.insertAdjacentHTML('beforeend', html);
    } else {
        container.innerHTML = html;
    }
}

window.markAsRead = async function (id) {
    const result = await firestoreHelper.updateDocument('contacts', id, { read: true });
    if (result.success) {
        await loadMessages();
    }
};

window.deleteMessage = async function (id) {
    if (!confirm('Are you sure you want to delete this message?')) return;

    const result = await firestoreHelper.deleteDocument('contacts', id);
    if (result.success) {
        alert('Message deleted successfully!');
        await loadMessages();
    }
};

window.filterMessages = function () {
    const filter = document.getElementById('message-filter').value;
    const filtered = filter === 'all' ? allMessages :
        filter === 'new' ? allMessages.filter(m => !m.read) :
            allMessages.filter(m => m.read);
    displayMessages(filtered);
};

// ========== NOTIFICATIONS MANAGEMENT ==========

async function loadNotifications() {
    console.log('Loading notifications progressively...');
    const container = document.getElementById('notifications-list');
    if (!container) return;
    container.innerHTML = '<div class="text-gray-500 text-center py-4"><i class="fas fa-spinner fa-spin mr-2"></i>Loading...</div>';

    allNotifications = [];
    let lastDoc = null;
    let hasMore = true;
    let isFirstChunk = true;

    try {
        while (hasMore) {
            const result = await firestoreHelper.getPaginatedData('notifications', 20, lastDoc);

            if (result.success) {
                const chunk = result.data;
                lastDoc = result.lastDoc;
                hasMore = result.hasMore;

                if (isFirstChunk) {
                    container.innerHTML = '';
                    allNotifications = chunk;
                    displayNotifications(chunk, false);
                    isFirstChunk = false;
                } else {
                    allNotifications = [...allNotifications, ...chunk];
                    displayNotifications(chunk, true);
                }

                if (allNotifications.length === 0) {
                    container.innerHTML = '<p class="text-gray-500 text-center py-4">No notifications yet</p>';
                    return;
                }

                if (hasMore) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            } else {
                console.error("Error loading notifications chunk:", result.error);
                hasMore = false;
                if (isFirstChunk) {
                    container.innerHTML = '<p class="text-gray-500 text-center py-4">No notifications yet</p>';
                }
            }
        }
    } catch (error) {
        console.error("Critical error in loadNotifications:", error);
    }
}

function displayNotifications(notifications, append = false) {
    const container = document.getElementById('notifications-list');

    const html = notifications.map(notif => `
        <div class="bg-white border-2 border-gray-200 rounded-lg p-4 flex justify-between items-start animate-fade-in mb-3">
            <div class="flex items-center gap-3">
                <i class="fas ${notif.icon || 'fa-bell'} text-yellow-500 text-xl mt-1"></i>
                <p class="text-gray-800">${notif.message}</p>
            </div>
            <button onclick="deleteNotification('${notif.id}')" 
                class="text-red-600 hover:text-red-800 ml-2">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `).join('');

    if (append) {
        container.insertAdjacentHTML('beforeend', html);
    } else {
        container.innerHTML = html;
    }
}

async function handleNotificationSubmit(e) {
    e.preventDefault();

    const icon = document.getElementById('notif-icon').value;
    const message = document.getElementById('notif-message').value;

    // Schema (NotificationCreateRequest) accepts: message, status, icon
    const result = await firestoreHelper.addDocument('notifications', {
        message: message,
        status: 'active',
        icon: icon
    });

    if (result.success) {
        e.target.reset();
        await loadNotifications();
        showToast('success', 'Notification posted successfully!');
    } else {
        alert('Error adding notification: ' + result.error);
    }
}

window.deleteNotification = async function (id) {
    if (!confirm('Are you sure you want to delete this notification?')) return;

    const result = await firestoreHelper.deleteDocument('notifications', id);
    if (result.success) {
        alert('Notification deleted successfully!');
        await loadNotifications();
    }
};

// ========== UTILITY FUNCTIONS ==========

function formatClass(cls) {
    const classMap = {
        'lkg': 'LKG',
        'ukg': 'UKG',
        '1': '1',
        '2': '2',
        '3': '3',
        '4': '4',
        '5': '5',
        '6': '6',
        '7': '7',
        '8': '8'
    };
    return classMap[cls] || cls;
}

// Helper for exam type formatting
function formatExamType(type) {
    const map = {
        'unit1': 'Unit Test 1',
        'unit2': 'Unit Test 2',
        'half-yearly': 'Half Yearly',
        'annual': 'Annual Exam'
    };
    return map[type] || type;
}

function updateNotificationDots() {
    // 1. Check pending admissions
    const pendingAdmissions = allAdmissions.filter(a => a.status === 'pending').length;
    const admissionBadge = document.getElementById('nav-admissions-badge');
    if (admissionBadge) {
        if (pendingAdmissions > 0) {
            admissionBadge.classList.remove('hidden');
        } else {
            admissionBadge.classList.add('hidden');
        }
    }

    // 2. Check pending messages
    // Assuming messages have a 'read' status, otherwise count all or implement logic later
    // For now, if there are any messages, let's treat new ones since last session as notification worthy
    // Or just show dot if there are any messages (simple version)
    // Better: Show dot if count > 0 (since we don't have read status yet)
    // Actually, let's stick to showing dot if there are pending items of some sort
    // For messages, we'll just check if total > 0 for now as 'unread' logic isn't fully built
    const messageBadge = document.getElementById('nav-messages-badge');
    if (messageBadge) {
        if (allMessages.length > 0) { // Ideally filter by !msg.read
            messageBadge.classList.remove('hidden');
        } else {
            messageBadge.classList.add('hidden');
        }
    }
}

function updateStats() {
    const admEl = document.getElementById('total-admissions');
    const padEl = document.getElementById('pending-admissions');
    const conEl = document.getElementById('total-contacts');
    const stuEl = document.getElementById('total-students');

    if (admEl) admEl.textContent = allAdmissions.length;
    if (padEl) padEl.textContent = allAdmissions.filter(a => a.status === 'pending').length;
    if (conEl) conEl.textContent = allMessages.length;
    if (stuEl) stuEl.textContent = allStudents.length;

    // Update sidebar dots whenever stats update
    updateNotificationDots();
}

// Consolidated Tab Switching Function
window.switchTab = function (tab) {
    // 1. Hide all tab content sections
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    
    // 2. Clear active state from all navigation buttons
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

    // 3. Show the requested tab content
    const content = document.getElementById(`${tab}-tab`);
    if (content) {
        content.classList.add('active');
        // Scroll to top of content area on mobile
        if (window.innerWidth < 768) window.scrollTo({ top: 300, behavior: 'smooth' });
    }

    // 4. Highlight the matching nav button
    // Try finding by exact onclick match (most reliable for our static structure)
    let btn = document.querySelector(`button[onclick*="switchTab('${tab}')"]`);
    
    // Fallback: search within .tab-btn class for text content or fuzzy onclick
    if (!btn) {
        const allTabBtns = document.querySelectorAll('.tab-btn');
        btn = Array.from(allTabBtns).find(b => 
            b.onclick?.toString().includes(`'${tab}'`) || 
            b.textContent.toLowerCase().includes(tab.split('-')[0])
        );
    }

    if (btn) btn.classList.add('active');

    // 5. Special handlers for specific tabs
    if (tab === 'teacher-reports') {
        if (typeof loadTeacherReports === 'function') loadTeacherReports();
    }
    
    // If we're on dashboard, maybe refresh stats
    if (tab === 'dashboard' && typeof updateStats === 'function') {
        updateStats();
    }
};

// Initialize on load
initDashboard();


// Monitoring Sub-tabs
// Log page view
analyticsHelper.logPageView('admin_dashboard');

// ========== FEE MANAGEMENT FUNCTIONS ==========
// Helper to extract student name from various possible database keys
const getStudentDisplayName = (s) => {
    if (!s) return 'Unknown Student';
    return s.studentName || s.name || s.student_name || s.scholarName || s.fullName || 'Unknown';
};

// Helper to extract roll number from various possible database keys
const getStudentDisplayRoll = (s) => {
    if (!s) return 'No Roll';
    return s.rollNumber || s.rollNo || s.roll_no || s.admissionId || 'No Roll';
};

window.openAddFeeModal = function () {
    document.getElementById('add-fee-modal').classList.remove('hidden');
    
    // Reset form first
    document.getElementById('add-fee-form').reset();
    
    // Set defaults
    const now = new Date();
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    document.getElementById('fee-year').value = now.getFullYear();
    document.getElementById('fee-month').value = months[now.getMonth()];
    
    document.getElementById('fee-student-id').innerHTML = '<option value="">First Select Class</option>';
};

window.closeAddFeeModal = function () {
    document.getElementById('add-fee-modal').classList.add('hidden');
};

window.populateFeeStudentList = function () {
    const classVal = document.getElementById('fee-class-select').value;
    const studentSelect = document.getElementById('fee-student-id');
    
    if (!classVal) {
        studentSelect.innerHTML = '<option value="">First Select Class</option>';
        return;
    }

    const filtered = allStudents.filter(s => s.class && s.class.toLowerCase() === classVal.toLowerCase());
    
    if (filtered.length === 0) {
        studentSelect.innerHTML = '<option value="">No students in this class</option>';
        return;
    }

    studentSelect.innerHTML = '<option value="">Select Student</option>' + 
        filtered.sort((a,b) => getStudentDisplayName(a).localeCompare(getStudentDisplayName(b)))
        .map(s => `<option value="${s.id}">${getStudentDisplayName(s)} (${getStudentDisplayRoll(s)})</option>`)
        .join('');
};

window.handleFeeSubmit = async function (e) {
    e.preventDefault();
    const btn = document.getElementById('save-fee-btn');
    const originalText = btn.innerHTML;
    
    const studentId = document.getElementById('fee-student-id').value;
    const classVal = document.getElementById('fee-class-select').value;
    const month = document.getElementById('fee-month').value;
    const year = parseInt(document.getElementById('fee-year').value);
    const amount = parseFloat(document.getElementById('fee-amount').value);
    const receiptNumber = document.getElementById('fee-receipt').value.trim();

    // Find student for history record
    const student = allStudents.find(s => s.id === studentId);
    const studentName = getStudentDisplayName(student);

    try {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';
        btn.disabled = true;

        // 1. DUPLICATE CHECK: Check if fee for this student+month+year already exists
        const checkResult = await firestoreHelper.getDocuments('fees', [
            where('studentId', '==', studentId),
            where('month', '==', month),
            where('year', '==', year)
        ]);
        
        if (checkResult.success && checkResult.data && checkResult.data.length > 0) {
            window.showToast('error', `Fee already paid for ${month} ${year}! Refer to receipt: ${checkResult.data[0].receiptNumber || 'N/A'}`);
            btn.innerHTML = originalText;
            btn.disabled = false;
            return;
        }

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

        // 2. SAVE RECORD
        const nowIso = new Date().toISOString();
        const saveResult = await firestoreHelper.addDocument('fees', {
            studentId,
            studentName,
            class: classVal,
            month,
            year,
            amount,
            receiptNumber,
            timestamp: nowIso,          // used by teacher-dashboard for date display & sorting
            submittedAt: nowIso,
            paymentDate: new Date().toLocaleDateString('en-IN'),
            paymentTime: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
        });

        if (!saveResult.success) throw new Error(saveResult.error || 'Save failed');

        window.showToast('success', 'Fee Record Saved Successfully!');
        closeAddFeeModal();
        loadRecentFees(); // Refresh dashboard table
    } catch (error) {
        console.error("Fee saving error:", error);
        window.showToast('error', 'Error: ' + error.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

window.deleteFeeRecord = async function (id, fromModal = false) {
    if (!confirm('Are you sure you want to PERMANENTLY delete this fee record? This action cannot be undone.')) return;

    try {
        const result = await firestoreHelper.deleteDocument('fees', id);
        if (!result.success) throw new Error(result.error || 'Delete failed');
        
        window.showToast('success', 'Fee Record Deleted Successfully!');
        
        // Refresh appropriate views
        loadRecentFees();
        if (fromModal) {
            loadFeeHistory();
        }
    } catch (error) {
        console.error("Error deleting fee:", error);
        window.showToast('error', 'Error: ' + error.message);
    }
};

window.openViewFeeModal = function () {
    document.getElementById('view-fee-modal').classList.remove('hidden');
    loadFeeHistory();
};

window.closeViewFeeModal = function () {
    document.getElementById('view-fee-modal').classList.add('hidden');
};

window.loadFeeHistory = async function () {
    const tbody = document.getElementById('fee-history-tbody');
    tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-10 text-center text-gray-500"><i class="fas fa-spinner fa-spin"></i> Loading transaction history...</td></tr>';

    try {
        const result = await firestoreHelper.getDocuments('fees');
        if (!result.success) throw new Error(result.error || 'Failed to load fees');
        
        const records = (result.data || []).sort((a, b) => new Date(b.timestamp || b.submittedAt) - new Date(a.timestamp || a.submittedAt));
        window.allFeeRecords = records;
        
        // Apply filters automatically
        handleFeeHistoryFilter();
    } catch (error) {
        console.error("Error loading history:", error);
        tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-10 text-center text-red-500">Error: ${error.message}</td></tr>`;
    }
};

window.renderFeeHistory = function (records) {
    const tbody = document.getElementById('fee-history-tbody');
    if (!tbody) return;

    if (!records || records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-20 text-center text-gray-400 font-bold uppercase tracking-widest bg-gray-50 border-2 border-dashed border-gray-100 rounded-xl">No transactions found for this selection</td></tr>';
        return;
    }

    tbody.innerHTML = records.map(f => {
        // Enforce registration number retrieval (finding student is preferred as record might be old)
        const student = allStudents.find(s => s.id === f.studentId);
        const regNo = student ? (student.serialNumber || student.admissionId || student.registrationNumber || '---') : 'N/A';
        const displayName = f.studentName || (student ? getStudentDisplayName(student) : 'Unknown');

        const paidAt = (f.timestamp || f.submittedAt) ? new Date(f.timestamp || f.submittedAt) : null;
        const dateStr = paidAt ? paidAt.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-';

        return `
            <tr class="border-b last:border-0 hover:bg-emerald-50 transition-colors group">
                <td class="px-4 py-4 text-gray-600 font-medium">
                    ${dateStr}
                </td>
                <td class="px-4 py-4 font-mono text-emerald-800 font-black">
                    ${f.receiptNumber || '---'}
                </td>
                <td class="px-4 py-4">
                    <div class="font-black text-gray-900 group-hover:text-emerald-900">${displayName}</div>
                    <div class="text-[10px] text-gray-400 font-mono">${regNo}</div>
                </td>
                <td class="px-4 py-4 font-black uppercase text-gray-700 text-xs">Class ${formatClass(f.class || '')}</td>
                <td class="px-4 py-4 text-blue-900 font-black tracking-tighter">
                    ${f.month}
                </td>
                <td class="px-4 py-4 font-black text-emerald-700">
                    ₹${(f.amount || 0).toLocaleString()}
                </td>
                <td class="px-4 py-4 text-center">
                    <div class="flex items-center justify-center gap-2">
                        <a href="#" onclick="event.preventDefault(); event.stopPropagation(); viewFeeCard('${f.studentId}', determineSession('${f.year}', '${f.month}'));"
                            class="bg-emerald-600 text-white px-3 py-1.5 rounded-md text-[10px] font-black hover:bg-emerald-700 transition-all shadow-sm flex items-center gap-1 select-none"
                            style="background-color: #059669 !important; text-decoration: none;">
                            <i class="fas fa-eye"></i> CARD
                        </a>
                        <button onclick="event.stopPropagation(); deleteFeeRecord('${f.id}', true);" 
                            class="bg-red-50 text-red-600 w-8 h-8 rounded-md flex items-center justify-center hover:bg-red-600 hover:text-white transition-all shadow-sm border border-red-100"
                            title="Delete Record">
                            <i class="fas fa-trash-alt text-[10px]"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
};

window.handleFeeHistoryFilter = function (event) {
    if (event) event.preventDefault();
    
    const classVal = document.getElementById('view-fee-class').value;
    const sessionToUse = document.getElementById('view-fee-session').value;
    const monthVal = document.getElementById('view-fee-month').value;

    let records = [...(window.allFeeRecords || [])];
    
    // 1. Filter by Class
    if (classVal) {
        records = records.filter(f => (f.class || '').toLowerCase() === classVal.toLowerCase());
    }
    
    // 2. Filter by Month
    if (monthVal) {
        records = records.filter(f => f.month === monthVal);
    }

    // 3. Filter by Session (Year matching) - ONLY if a specific session is picked
    if (sessionToUse && sessionToUse !== "") {
        const startYear = parseInt(sessionToUse.split('-')[0]) || 2025;
        // Academic year spans across two calendar years
        records = records.filter(f => {
            const rYear = parseInt(f.year);
            // Months Jan-Mar are for the latter year of the session
            const isLateMonth = ['January', 'February', 'March'].includes(f.month);
            return isLateMonth ? rYear === startYear + 1 : rYear === startYear;
        });
    }

    // Sort by Date (Newest first)
    records.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    renderFeeHistory(records);
};

window.determineSession = function(yearStr, monthStr) {
    let yr = parseInt(yearStr);
    if (isNaN(yr)) yr = new Date().getFullYear();
    const isLateMonth = ['January', 'February', 'March'].includes(monthStr || '');
    if (isLateMonth) {
        return (yr - 1) + '-' + yr.toString().substring(2);
    } else {
        return yr + '-' + (yr + 1).toString().substring(2);
    }
};

window.viewFeeCard = async function (studentId, session) {
    if(!session) session = '2025-26';
    console.log(`[FeeAction] Opening modern modal card for Student: ${studentId}, Session: ${session}`);
    
    document.getElementById('fee-card-modal').classList.remove('hidden');
    document.getElementById('fc-session-title').textContent = `FEE CARD ${session}`;
    
    // reset UI
    document.getElementById('fc-student-name').textContent = 'Loading...';
    const monthsContainer = document.getElementById('fc-months-container');
    if (monthsContainer) monthsContainer.innerHTML = '<div class="col-span-2 py-10 text-center text-gray-400"><i class="fas fa-spinner fa-spin mr-2"></i>Loading fee records...</div>';

    try {
        // use local array allStudents if possible, otherwise use API
        let s = window.allStudents ? window.allStudents.find(x => x.id === studentId) : null;
        if (!s) {
            const sResp = await fetch(`/api/public/students/${studentId}`);
            const sRes = await sResp.json();
            if (sRes.success) s = sRes.data;
        }
        
        if (!s) throw new Error("Student not found");

        document.getElementById('fc-student-name').textContent = s.studentName || s.name || '-';
        document.getElementById('fc-reg-no').textContent = s.serialNumber || s.admissionId || s.registrationNumber || '-';
        document.getElementById('fc-roll-no').textContent = s.rollNumber || '-';
        document.getElementById('fc-father-name').textContent = s.fatherName || '-';
        document.getElementById('fc-class').textContent = s.class || '-';
        document.getElementById('fc-mobile').textContent = s.mobile || '-';
        document.getElementById('fc-address').textContent = s.address || '-';

        const photoUrl = s.photo || s.avatar_url || s.imageUrl;
        const img = document.getElementById('fc-student-photo');
        const placeholder = document.getElementById('fc-photo-placeholder');
        if (photoUrl) {
            img.src = photoUrl;
            img.classList.remove('hidden');
            if (placeholder) placeholder.classList.add('hidden');
        } else {
            img.classList.add('hidden');
            if (placeholder) placeholder.classList.remove('hidden');
        }

        // fetch fees
        let studentFees = [];
        if (window.allFeeRecords) {
            studentFees = window.allFeeRecords.filter(f => f.studentId === studentId);
        } else {
            const fResp = await fetch(`/api/public/fees/${studentId}`);
            const fRes = await fResp.json();
            studentFees = fRes.data || [];
        }
        
        // Sort newest first
        studentFees.sort((a, b) => {
            const dA = a.submittedAt ? new Date(a.submittedAt) : (a.paymentDate ? new Date(a.paymentDate) : new Date(0));
            const dB = b.submittedAt ? new Date(b.submittedAt) : (b.paymentDate ? new Date(b.paymentDate) : new Date(0));
            return dB - dA;
        });

        const startYear = parseInt(session.split('-')[0]) || 2025;
        const academicMonths = [
            { name: 'April', year: startYear }, { name: 'May', year: startYear }, 
            { name: 'June', year: startYear }, { name: 'July', year: startYear },
            { name: 'August', year: startYear }, { name: 'September', year: startYear },
            { name: 'October', year: startYear }, { name: 'November', year: startYear },
            { name: 'December', year: startYear }, { name: 'January', year: startYear + 1 },
            { name: 'February', year: startYear + 1 }, { name: 'March', year: startYear + 1 }
        ];

        function renderPremiumMonthBox(m) {
            const record = studentFees.find(f => 
                f.month.toLowerCase() === m.name.toLowerCase() && 
                parseInt(f.year) === m.year
            );
            
            const isPaid = !!record;
            const paidAt = record?.submittedAt ? new Date(record.submittedAt) : (record?.paymentDate ? new Date(record.paymentDate) : null);
            let dateStr = '', timeStr = '';
            if (paidAt && !isNaN(paidAt)) {
                dateStr = paidAt.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' });
                timeStr = paidAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
            } else if (record?.paymentDate) {
                dateStr = record.paymentDate;
                timeStr = record.paymentTime || '';
            }
            
            const rNo = record?.receiptNumber || record?.receiptNo || record?.receipt_no || record?.receipt_number || record?.id?.substring(0,6) || '---';

            if (isPaid) {
                return `
                    <div class="bg-white border-2 border-green-100 rounded-xl p-4 flex justify-between items-center shadow-sm relative overflow-hidden group hover:border-green-300 transition-colors">
                        <div class="absolute left-0 top-0 bottom-0 w-1 bg-green-500"></div>
                        <div>
                            <div class="flex items-center gap-2 mb-1">
                                <h4 class="font-bold text-slate-800 uppercase text-xs">${m.name} ${m.year}</h4>
                            </div>
                            <div class="flex items-center gap-2 text-xs">
                                <span class="text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded">R: ${rNo}</span>
                            </div>
                        </div>
                        <div class="text-right flex flex-col items-end">
                            <div class="bg-green-100 text-green-700 px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 mb-1">
                                <i data-lucide="check-circle-2" class="w-3 h-3"></i> Paid
                            </div>
                            <p class="text-[9px] font-bold text-slate-500">${dateStr}</p>
                            <p class="text-[9px] text-slate-400 font-medium">${timeStr}</p>
                        </div>
                    </div>
                `;
            } else {
                return `
                    <div class="bg-white border border-slate-200 rounded-xl p-4 flex justify-between items-center hover:border-amber-200 hover:shadow-md transition-all">
                        <div>
                            <h4 class="font-bold text-slate-800 uppercase text-xs">${m.name} <span class="text-slate-400 font-medium">${m.year}</span></h4>
                        </div>
                        <div class="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-[10px] font-bold uppercase">
                            Pending
                        </div>
                    </div>
                `;
            }
        }

        if (monthsContainer) {
            monthsContainer.innerHTML = academicMonths.map(m => renderPremiumMonthBox(m)).join('');
            // Initialize Lucide icons
            if (window.lucide) {
                window.lucide.createIcons();
            }
        }

    } catch (err) { 
        console.error(err); 
        if (monthsContainer) monthsContainer.innerHTML = `<div class="col-span-2 p-10 text-center text-red-500 font-bold uppercase tracking-widest bg-red-50 rounded-xl border-2 border-dashed border-red-100">Error loading card data: ${err.message}</div>`;
    }
};

window.closeFeeCardModal = function () {
    document.getElementById('fee-card-modal').classList.add('hidden');
};

window.printFeeCardModal = function () {
    document.body.classList.add('printing-modal');
    window.print();
    setTimeout(() => {
        document.body.classList.remove('printing-modal');
    }, 1000);
};

// Deprecated filterFeeHistory - replaced by handleFeeHistoryFilter
window.filterFeeHistory = function () {
    handleFeeHistoryFilter();
};

window.loadRecentFees = async function () {
    const container = document.getElementById('recent-fees-tbody');
    if (!container) return;

    const classFilter = document.getElementById('recent-fee-class-filter')?.value;

    try {
        // Use REST API — filter client-side after fetch
        const result = await firestoreHelper.getDocuments('fees');
        if (!result.success) throw new Error(result.error || 'Failed to load fees');

        let fees = (result.data || [])
            .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
            .slice(0, 20); // show latest 20

        if (classFilter) {
            fees = fees.filter(f => (f.class || '').toLowerCase() === classFilter.toLowerCase());
        }

        if (fees.length === 0) {
            container.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-gray-500">No recent transactions.</td></tr>';
            return;
        }

        container.innerHTML = fees.map(f => `
            <tr class="border-b last:border-0 hover:bg-gray-50 group">
                <td class="px-4 py-3">
                    <div class="font-bold text-gray-800">${f.studentName || 'Unknown Student'}</div>
                    <div class="text-xs text-gray-500 uppercase">Class ${f.class || '-'}</div>
                </td>
                <td class="px-4 py-3 text-gray-600 font-medium">
                    <span class="text-blue-900">${f.month || '-'}</span> ${f.year || ''}
                    <div class="text-[10px] text-gray-400 font-mono">R: ${f.receiptNumber || '---'}</div>
                </td>
                <td class="px-4 py-3 font-bold text-green-700">₹${(f.amount || 0).toLocaleString()}</td>
                <td class="px-4 py-3 text-right">
                    <div class="flex items-center justify-end gap-3">
                        <span class="text-[10px] text-gray-400 font-bold">${f.submittedAt ? new Date(f.submittedAt).toLocaleDateString('en-IN') : '-'}</span>
                        <button onclick="deleteFeeRecord('${f.id}')" 
                            class="opacity-0 group-hover:opacity-100 bg-red-50 text-red-600 w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-600 hover:text-white transition-all border border-red-100"
                            title="Delete Record">
                            <i class="fas fa-trash-alt text-[10px]"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error("Error loading recent fees:", error);
        container.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-red-500">Error loading fees.</td></tr>';
    }
};

// Update switchTab to include loadRecentFees
const originalSwitchTab = window.switchTab;
window.switchTab = function (tab) {
    if (originalSwitchTab) originalSwitchTab(tab);
    if (tab === 'fees') {
        loadRecentFees();
    }
};

window.openLedgerModal = function () {
    document.getElementById('ledger-modal').classList.remove('hidden');
    populateLedgerStudentList();
    // Reset view
    document.getElementById('ledger-content').classList.add('hidden');
    document.getElementById('ledger-placeholder').classList.remove('hidden');
    document.getElementById('ledger-student-select').value = "";
};

window.closeLedgerModal = function () {
    document.getElementById('ledger-modal').classList.add('hidden');
};

window.populateLedgerStudentList = function () {
    const select = document.getElementById('ledger-student-select');
    if (!select) return;

    // Use allStudents which is already loaded in global scope
    if (allStudents.length === 0) {
        select.innerHTML = '<option value="">Loading students...</option>';
        return;
    }

    const sorted = [...allStudents].sort((a, b) => 
        (a.class || "").localeCompare(b.class || "") || 
        getStudentDisplayName(a).localeCompare(getStudentDisplayName(b))
    );

    select.innerHTML = '<option value="">Search Student...</option>' + 
        sorted.map(s => `<option value="${s.id}">Class ${s.class || '?'} - ${getStudentDisplayName(s)} (${getStudentDisplayRoll(s)})</option>`).join('');
};

window.handleLedgerStudentChange = function () {
    const studentId = document.getElementById('ledger-student-select').value;
    if (!studentId) {
        document.getElementById('ledger-content').classList.add('hidden');
        document.getElementById('ledger-placeholder').classList.remove('hidden');
        return;
    }

    loadStudentLedger(studentId);
};

window.loadStudentLedger = async function (studentId) {
    const content = document.getElementById('ledger-content');
    const placeholder = document.getElementById('ledger-placeholder');
    const tbody = document.getElementById('ledger-tbody');

    content.classList.remove('hidden');
    placeholder.classList.add('hidden');
    tbody.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-gray-500"><i class="fas fa-spinner fa-spin mr-2"></i>Generating ledger...</td></tr>';

    try {
        const student = allStudents.find(s => s.id === studentId);
        if (!student) throw new Error("Student not found");

        // Fetch all fee records for this student
        const result = await firestoreHelper.getDocuments('fees');
        if (!result.success) throw new Error(result.error);

        const studentFees = (result.data || []).filter(f => f.studentId === studentId);
        
        // Fee Structure Mapping
        const FEE_STRUCTURE = {
            'lkg': 600, 'ukg': 600,
            '1': 700, '2': 700, '3': 700,
            '4': 800, '5': 800,
            '6': 900, '7': 900, '8': 900
        };

        const monthlyFee = FEE_STRUCTURE[(student.class || "").toLowerCase()] || 0;
        
        // Months for Academic Session (Starting April)
        const academicMonths = [
            { name: "April", year: 2025 },
            { name: "May", year: 2025 },
            { name: "June", year: 2025 },
            { name: "July", year: 2025 },
            { name: "August", year: 2025 },
            { name: "September", year: 2025 },
            { name: "October", year: 2025 },
            { name: "November", year: 2025 },
            { name: "December", year: 2025 },
            { name: "January", year: 2026 },
            { name: "February", year: 2026 },
            { name: "March", year: 2026 }
        ];

        // Only calculate up to current month
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonthIdx = now.getMonth(); // 0-11
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        
        let totalPaid = 0;
        let totalExpected = 0;
        let rowsHtml = '';

        academicMonths.forEach(m => {
            // Check if this month has passed or is current
            const monthIdx = monthNames.indexOf(m.name);
            const isFuture = (m.year > currentYear) || (m.year === currentYear && monthIdx > currentMonthIdx);
            
            if (isFuture) return;

            totalExpected += monthlyFee;
            
            // Find if paid
            const payment = studentFees.find(f => f.month === m.name && parseInt(f.year) === m.year);
            const paidAmount = payment ? (parseFloat(payment.amount) || 0) : 0;
            totalPaid += paidAmount;

            const isPaid = paidAmount >= monthlyFee;
            const statusClass = isPaid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';
            const statusText = isPaid ? 'Full Paid' : (paidAmount > 0 ? 'Partial' : 'Overdue');

            rowsHtml += `
                <tr class="border-b transition-colors hover:bg-gray-50">
                    <td class="px-6 py-4 font-semibold">${m.name} ${m.year}</td>
                    <td class="px-6 py-4 text-gray-600">Monthly Tuition Fee</td>
                    <td class="px-6 py-4 font-bold">₹${monthlyFee}</td>
                    <td class="px-6 py-4 font-bold text-green-600">₹${paidAmount}</td>
                    <td class="px-6 py-4">
                        <span class="px-2 py-1 rounded-full text-xs font-bold ${statusClass}">${statusText}</span>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = rowsHtml || '<tr><td colspan="5" class="p-8 text-center">No data for current session.</td></tr>';
        
        // Update Summary Cards
        document.getElementById('ledger-total-paid').textContent = `₹${totalPaid.toLocaleString()}`;
        document.getElementById('ledger-total-expected').textContent = `₹${totalExpected.toLocaleString()}`;
        const balance = totalExpected - totalPaid;
        const balanceEl = document.getElementById('ledger-balance');
        balanceEl.textContent = `₹${balance.toLocaleString()}`;
        balanceEl.className = `text-2xl font-bold ${balance > 0 ? 'text-red-900' : 'text-green-900'}`;

    } catch (error) {
        console.error("Ledger generation error:", error);
        tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-red-500">Error: ${error.message}</td></tr>`;
    }
};

// ========== GLOBAL MODAL FUNCTIONS ==========
window.closeTeacherModal = function () {
    const modal = document.getElementById('teacher-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.getElementById('teacher-form').reset();
        document.getElementById('teacher-preview').src = '../assets/images/logo/logo.png';
        currentEditingTeacher = null;
    }
};

window.openAddTeacherModal = function () {
    const modal = document.getElementById('teacher-modal');
    if (modal) {
        document.getElementById('teacher-form').reset();
        document.getElementById('teacher-id').value = '';
        document.getElementById('teacher-preview').src = '../assets/images/logo/logo.png';
        document.getElementById('teacher-modal-title').textContent = 'Add Teacher';
        // Reset specific fields
        document.getElementById('teacher-password').placeholder = 'Set login password';

        modal.classList.remove('hidden');
    }
};

// Ensure other modals also have their close functions if not defined
if (!window.closeStudentModal) {
    window.closeStudentModal = function () {
        document.getElementById('student-modal').classList.add('hidden');
        document.getElementById('student-form').reset();
        document.getElementById('student-preview').src = '../assets/images/logo/logo.png';
        currentEditingStudent = null;
        document.getElementById('student-modal-title').textContent = 'Add Student';
    };
}

// User Profile & Password Management
window.toggleUserDropdown = function (e) {
    if (e) e.stopPropagation();
    const dropdown = document.getElementById('user-dropdown');
    dropdown.classList.toggle('hidden');
    
    // Standardized outside click handling
    if (!dropdown.classList.contains('hidden')) {
        const closeDropdown = (event) => {
            if (!dropdown.contains(event.target)) {
                dropdown.classList.add('hidden');
                document.removeEventListener('click', closeDropdown);
            }
        };
        setTimeout(() => document.addEventListener('click', closeDropdown), 10);
    }
}

window.openChangePasswordModal = function () {
    document.getElementById('user-dropdown').classList.add('hidden'); // Close dropdown
    const modal = document.getElementById('change-password-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        document.getElementById('password-modal-content').classList.remove('scale-95', 'opacity-0');
        document.getElementById('password-modal-content').classList.add('scale-100', 'opacity-100');
    }, 10);
    document.getElementById('change-password-form').reset();
}

window.closeChangePasswordModal = function () {
    const content = document.getElementById('password-modal-content');
    content.classList.remove('scale-100', 'opacity-100');
    content.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        const modal = document.getElementById('change-password-modal');
        modal.classList.remove('flex');
        modal.classList.add('hidden');
    }, 300);
}

window.togglePasswordVisibility = function (id) {
    const input = document.getElementById(id);
    const icon = input.parentElement.querySelector('i.fa-eye') || input.parentElement.querySelector('i.fa-eye-slash');
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

window.handlePasswordChange = async function (e) {
    e.preventDefault();
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const btn = document.getElementById('save-password-btn');

    if (newPassword !== confirmPassword) {
        showToast('error', 'New passwords do not match!');
        return;
    }

    if (newPassword.length < 6) {
        showToast('error', 'Password must be at least 6 characters.');
        return;
    }

    try {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
        btn.disabled = true;

        const user = auth.currentUser;
        if (!user) {
            showToast('error', 'User not authenticated. Please login again.');
            setTimeout(() => authHelper.logout(), 2000);
            return;
        }

        // 1. Re-authenticate
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);

        // 2. Update Password
        await updatePassword(user, newPassword);

        showToast('success', 'Password updated successfully!');
        closeChangePasswordModal();

    } catch (error) {
        console.error("Password Update Error:", error);
        let msg = 'Failed to update password.';
        if (error.code === 'auth/wrong-password') msg = 'Current password is incorrect.';
        if (error.code === 'auth/requires-recent-login') msg = 'Please logout and login again to proceed.';
        showToast('error', msg);
    } finally {
        btn.innerHTML = '<span>Update Password</span><i class="fas fa-arrow-right text-xs"></i>';
        btn.disabled = false;
    }
}

// Setup email in dropdown if already present
if (auth.currentUser) {
    const emailEl = document.getElementById('dropdown-user-email');
    if (emailEl) emailEl.textContent = auth.currentUser.email;
}
// ========== LEDGER & EXPENSES ==========

const FEE_STRUCTURE = {
    'lkg': 600,
    'ukg': 600,
    '1': 700,
    '2': 700,
    '3': 700,
    '4': 800,
    '5': 800,
    '6': 900,
    '7': 900,
    '8': 900
};

window.openLedgerModal = async function() {
    document.getElementById('ledger-modal').classList.remove('hidden');
    await calculateLedgerData();
};

window.closeLedgerModal = function() {
    document.getElementById('ledger-modal').classList.add('hidden');
};

window.openExpenseModal = function() {
    document.getElementById('expense-modal').classList.remove('hidden');
};

window.closeExpenseModal = function() {
    document.getElementById('expense-modal').classList.add('hidden');
    document.getElementById('expense-form').reset();
};

window.handleExpenseSubmit = async function(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    
    const expenseData = {
        description: document.getElementById('exp-desc').value,
        amount: parseFloat(document.getElementById('exp-amount').value),
        date: new Date().toISOString(),
        type: 'other'
    };

    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        
        const result = await firestoreHelper.addDocument('expenses', expenseData);
        if(result.success) {
            showSuccessToast('Expense recorded!');
            closeExpenseModal();
            calculateLedgerData(); // Refresh ledger
        } else {
            throw new Error(result.error);
        }
    } catch(err) {
        alert('Error: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
};

async function calculateLedgerData() {
    const classBody = document.getElementById('ledger-class-body');
    if (classBody) classBody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-gray-500"><i class="fas fa-spinner fa-spin mr-2"></i>Calculating financials...</td></tr>';

    try {
        // 1. Calculate Income from Students
        const studentsByClass = {};
        allStudents.forEach(s => {
            const cls = (s.class || 'unknown').toLowerCase();
            studentsByClass[cls] = (studentsByClass[cls] || 0) + 1;
        });

        let totalAnnualIncome = 0;
        let rowsHtml = '';

        const classes = ['lkg', 'ukg', '1', '2', '3', '4', '5', '6', '7', '8'];
        
        classes.forEach(cls => {
            const count = studentsByClass[cls] || 0;
            const monthlyFee = FEE_STRUCTURE[cls] || 800;
            const miscCharge = 2000;
            
            // Formula: (Students * MonthlyFee * 12) + (Students * 2000)
            const annualIncome = (count * monthlyFee * 12) + (count * miscCharge);
            totalAnnualIncome += annualIncome;

            rowsHtml += `
                <tr class="border-b hover:bg-gray-50">
                    <td class="px-4 py-3 font-bold uppercase">${cls}</td>
                    <td class="px-4 py-3 text-right">${count}</td>
                    <td class="px-4 py-3 text-right">₹${monthlyFee}</td>
                    <td class="px-4 py-3 text-right">₹${count * miscCharge}</td>
                    <td class="px-4 py-3 text-right font-bold text-blue-900">₹${annualIncome.toLocaleString()}</td>
                </tr>
            `;
        });

        classBody.innerHTML = rowsHtml;

        // 2. Fetch Other Expenses
        const expenseResult = await firestoreHelper.getDocuments('expenses');
        let otherExpenseTotal = 0;
        if(expenseResult.success) {
            otherExpenseTotal = expenseResult.data.reduce((sum, exp) => sum + (exp.amount || 0), 0);
        }

        // 3. Calculate Teacher Salaries (Annual)
        // Note: we fetch allTeachers during loadAllData
        const totalMonthlySalaries = allTeachers.reduce((sum, t) => sum + (parseFloat(t.salary) || 0), 0);
        const annualSalaries = totalMonthlySalaries * 12;

        const totalExpenses = annualSalaries + otherExpenseTotal;
        const netBalance = totalAnnualIncome - totalExpenses;

        // Update UI
        document.getElementById('ledger-total-income').innerText = `₹${totalAnnualIncome.toLocaleString()}`;
        document.getElementById('ledger-total-expense').innerText = `₹${totalExpenses.toLocaleString()}`;
        document.getElementById('ledger-other-expense').innerText = `₹${otherExpenseTotal.toLocaleString()}`;
        document.getElementById('ledger-net-balance').innerText = `₹${netBalance.toLocaleString()}`;
        
        const balanceEl = document.getElementById('ledger-net-balance');
        if (balanceEl) balanceEl.className = `text-2xl font-bold ${netBalance >= 0 ? 'text-green-800' : 'text-red-600'}`;

    } catch (error) {
        console.error('Ledger calculation error:', error);
        classBody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-red-500">Error calculating financials. Check console.</td></tr>';
    }
}

// ========== SALARY SLIPS & ADMIT CARDS ==========

window.generateSalarySlip = async function(teacherId) {
    try {
        const teacher = allTeachers.find(t => t.id === teacherId);
        if (!teacher) {
            alert('Teacher details not found.');
            return;
        }

        // Show loading state
        document.getElementById('salary-slip-modal').classList.remove('hidden');
        document.getElementById('salary-slip-modal').classList.add('flex');
        
        // Populate data
        document.getElementById('slip-teacher-name').innerText = teacher.name || '---';
        document.getElementById('slip-teacher-subject').innerText = teacher.subject || '---';
        document.getElementById('slip-teacher-id').innerText = teacher.id.substring(0, 8).toUpperCase();
        
        const basicPay = parseFloat(teacher.salary) || 0;
        const hra = 2000;
        const conveyance = 1500;
        const grossTotal = basicPay + hra + conveyance;
        
        const pt = 200;
        const pf = 1800;
        const totalDeductions = pt + pf;
        const netSalary = grossTotal - totalDeductions;
        
        document.getElementById('slip-basic-pay').innerText = `₹${basicPay.toLocaleString()}`;
        document.getElementById('slip-gross-total').innerText = `₹${grossTotal.toLocaleString()}`;
        document.getElementById('slip-total-deductions').innerText = `₹${totalDeductions.toLocaleString()}`;
        document.getElementById('slip-net-salary').innerText = `₹${netSalary.toLocaleString()}`;
        
        const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const d = new Date();
        document.getElementById('slip-month-year').innerText = `For the month of ${months[d.getMonth()]} ${d.getFullYear()}`;

    } catch (e) {
        console.error(e);
        alert('Error generating salary slip.');
    }
};

window.closeSalarySlipModal = function() {
    document.getElementById('salary-slip-modal').classList.add('hidden');
    document.getElementById('salary-slip-modal').classList.remove('flex');
};

window.printSalarySlip = function() {
    const content = document.getElementById('salary-slip-content').innerHTML;
    const printWindow = window.open('', '_blank');
    printWindow.document.write('<html><head><title>Salary Slip</title>');
    printWindow.document.write('<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css">');
    printWindow.document.write('<style>@media print { body { padding: 0; margin: 0; } .printable-slip { box-shadow: none !important; border: none !important; margin: 0 !important; width: 100% !important; max-width: none !important; } }</style>');
    printWindow.document.write('</head><body>');
    printWindow.document.write(content);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    setTimeout(() => {
        printWindow.print();
    }, 500);
};

window.openExamConfigModal = async function() {
    const classId = document.getElementById('exam-class-select').value;
    const examType = document.getElementById('exam-type-select').value;
    
    if (!classId) {
        alert('Please select a class first.');
        return;
    }
    
    document.getElementById('config-target-info').innerText = `Class ${formatClass(classId)} | ${formatExamType(examType)}`;
    document.getElementById('exam-config-modal').classList.remove('hidden');
    document.getElementById('exam-config-modal').classList.add('flex');
    
    // Load existing config
    const configId = `${classId}_${examType}`;
    const result = await firestoreHelper.getDocument('exam_schedules', configId);
    
    const container = document.getElementById('config-subjects-list');
    container.innerHTML = '';
    
    if (result.success && result.data.subjects) {
        result.data.subjects.forEach(sub => addConfigSubjectRow(sub.name, sub.date, sub.time));
    } else {
        // Default rows if none exist
        const defaultSubjects = ['Hindi', 'English', 'Mathematics', 'EVS / G.K. / Computer', 'A/V / Drawing'];
        defaultSubjects.forEach(s => addConfigSubjectRow(s, '', '8:30 AM - 11:30 AM'));
    }
};

window.closeExamConfigModal = function() {
    document.getElementById('exam-config-modal').classList.add('hidden');
    document.getElementById('exam-config-modal').classList.remove('flex');
};

function addConfigSubjectRow(name = '', date = '', time = '8:30 AM - 11:30 AM') {
    const container = document.getElementById('config-subjects-list');
    const div = document.createElement('div');
    div.className = 'grid grid-cols-12 gap-2 items-center bg-gray-50 p-2 rounded-lg border border-gray-100';
    div.innerHTML = `
        <div class="col-span-5">
            <input type="text" placeholder="Subject Name" value="${name}" class="w-full px-3 py-1.5 border rounded-md text-sm font-bold schedule-subject">
        </div>
        <div class="col-span-4">
            <input type="text" placeholder="Date (e.g. 15/05)" value="${date}" class="w-full px-3 py-1.5 border rounded-md text-sm schedule-date">
        </div>
        <div class="col-span-2">
            <input type="text" placeholder="Time" value="${time}" class="w-full px-3 py-1.5 border rounded-md text-[10px] schedule-time">
        </div>
        <div class="col-span-1 text-center">
            <button onclick="this.parentElement.parentElement.remove()" class="text-red-500 hover:text-red-700"><i class="fas fa-trash"></i></button>
        </div>
    `;
    container.appendChild(div);
}

window.addConfigSubject = function() {
    addConfigSubjectRow();
};

window.saveExamSchedule = async function() {
    const classId = document.getElementById('exam-class-select').value;
    const examType = document.getElementById('exam-type-select').value;
    const rows = document.querySelectorAll('#config-subjects-list > div');
    
    const subjects = [];
    rows.forEach(row => {
        const name = row.querySelector('.schedule-subject').value;
        const date = row.querySelector('.schedule-date').value;
        const time = row.querySelector('.schedule-time').value;
        if (name) subjects.push({ name, date, time });
    });
    
    if (subjects.length === 0) {
        alert('Please add at least one subject.');
        return;
    }
    
    const configId = `${classId}_${examType}`;
    const result = await firestoreHelper.setDocument('exam_schedules', configId, {
        classId,
        examType,
        subjects,
        updatedAt: new Date(),
        updatedBy: authHelper.getCurrentUser()?.email || 'admin'
    });
    
    if (result.success) {
        showNotification('Schedule saved as default successfully!', 'success');
        closeExamConfigModal();
    } else {
        alert('Error saving schedule: ' + result.error);
    }
};

function renderAdmitCardHTML(student, examType, schedule, timestamp) {
    const subjectsHTML = (schedule.subjects || []).map(sub => `
        <tr>
            <td class="border-2 border-gray-200 p-2 font-black text-blue-700">${sub.name}</td>
            <td class="border-2 border-gray-200 p-2 text-center font-bold text-gray-700">${sub.date || '---'}</td>
            <td class="border-2 border-gray-200 p-2 text-center text-gray-400 italic font-medium">${sub.time || '8:30 AM - 11:30 AM'}</td>
        </tr>
    `).join('');

    return `
        <!-- MARK: CARD WIDTH AND HEIGHT -->
        <!-- Modify 'width: 650px' and 'min-height: 500px' below to manually set the exact size of your admit card -->
        <div class="bg-white p-3 shadow-2xl mx-auto font-sans text-gray-800 relative overflow-hidden transition-all flex flex-col" style="border: 3px solid #1e3a8a; width: 650px; min-height: 500px; height: auto; box-sizing: border-box;">
            <!-- MARK: WATERMARK OPACITY & SIZE -->
            <!-- Modify 'opacity: 0.10' to change transparency (e.g. 0.15 is darker, 0.05 is lighter). Modify 'w-64' to change size. -->
            <div class="absolute inset-0 flex items-center justify-center pointer-events-none" style="opacity: 0.10;">
                <img src="../assets/images/logo/logo1.png" alt="Watermark" class="w-64">
            </div>
            
            <div class="flex items-center justify-between pb-1 mb-1 relative z-10" style="border-bottom: 3px solid #1e3a8a;">
                <!-- MARK: SCHOOL LOGO SIZE -->
                <!-- Modify 'w-14 h-14' to resize the top-left school logo -->
                <img src="../assets/images/logo/logo.png" alt="Logo" class="w-14 h-14 object-contain">
                <div class="flex-1 text-center px-2">
                    <h1 class="text-base font-black uppercase text-blue-900 tracking-tighter leading-none m-0" style="line-height: 1.1;">Police Modern School</h1>
                    <p class="text-[7px] font-bold text-gray-500 uppercase tracking-widest mt-0.5">25<sup>th</sup> BN PAC Raebareli, Uttar Pradesh</p>
                    <div class="inline-block bg-blue-900 text-white text-[8px] px-3 py-0.5 rounded-full mt-1 font-bold tracking-widest uppercase">
                        Admit Card
                    </div>
                </div>
                <!-- MARK: STUDENT PHOTO BOX SIZE -->
                <!-- Modify 'w-14 h-16' below to resize the student photograph container -->
                ${student.photo ? 
                    `<img src="${student.photo}" alt="Student Photo" class="w-14 h-16 object-cover border-2 border-blue-900 rounded" style="border: 2px solid #1e3a8a;">` : 
                    `<div class="w-14 h-16 border-2 border-dashed border-gray-400 flex items-center justify-center text-[7px] text-gray-400 text-center leading-tight bg-gray-50 rounded">
                        Affix<br>Photo
                    </div>`
                }
            </div>

            <div class="text-center mb-1 relative z-10">
                <h2 class="text-xs font-black text-blue-900 uppercase tracking-tight m-0" style="margin-top:-2px;">
                    ${formatExamType(examType)} Examination 2024-25
                </h2>
            </div>

            <div class="grid grid-cols-2 gap-x-6 gap-y-1 mb-2 text-[10px] relative z-10">
                <div class="border-b border-gray-200 pb-0.5">
                    <p class="text-[7px] uppercase font-bold text-gray-500 tracking-tighter mb-0.5">Student Name</p>
                    <p class="font-black text-gray-900 uppercase truncate">${student.studentName || student.name}</p>
                </div>
                <div class="border-b border-gray-200 pb-0.5">
                    <p class="text-[8px] uppercase font-bold text-gray-500 tracking-tighter mb-0.5">Roll Number</p>
                    <p class="font-black text-blue-900 font-mono text-xs">${student.rollNo || 'N/A'}</p>
                </div>
                <div class="border-b border-gray-200 pb-0.5">
                    <p class="text-[8px] uppercase font-bold text-gray-500 tracking-tighter mb-0.5">Class & Section</p>
                    <p class="font-black text-gray-900 uppercase">${formatClass(student.class)} / ${student.section || 'A'}</p>
                </div>
                <div class="border-b border-gray-200 pb-0.5">
                    <p class="text-[8px] uppercase font-bold text-gray-500 tracking-tighter mb-0.5">Father's Name</p>
                    <p class="font-black text-gray-900 uppercase truncate">${student.fatherName || '---'}</p>
                </div>
            </div>

            <div class="mb-2 relative z-10 flex-grow">
                <table class="w-full text-[9.5px] border-collapse">
                    <thead>
                        <tr class="bg-blue-50">
                            <th class="border-2 border-blue-900 p-1.5 text-blue-900 uppercase">Subject</th>
                            <th class="border-2 border-blue-900 p-1.5 text-blue-900 uppercase">Date</th>
                            <th class="border-2 border-blue-900 p-1.5 text-blue-900 uppercase">Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${subjectsHTML}
                    </tbody>
                </table>
            </div>

            <div class="flex justify-between items-end relative z-10 mt-auto">
                <div class="text-[7px] space-y-1 mb-1">
                    <p class="font-bold text-red-600 underline text-[8px]">Note:</p>
                    <ul class="list-disc list-inside text-gray-600 leading-tight font-medium">
                        <li>Carry admit card daily to the examination hall.</li>
                        <li>Reach the examination hall 15 minutes early.</li>
                    </ul>
                </div>
                <div class="flex flex-col items-center pt-1">
                    <!-- MARK: SIGNATURE SIZE -->
                    <!-- Modify 'h-10 w-48' to resize the signature image. You can also add 'mb-2' or 'mt-2' to adjust spacing. -->
                    <img src="../assets/images/logo/signature.png" alt="Signature" class="h-10 w-48 object-contain mb-1">
                    <div class="w-48 pt-1 text-center" style="border-top: 2px solid #1e3a8a;">
                        <p class="text-[8px] font-black text-blue-900 tracking-wide">Controller of Exams</p>
                    </div>
                </div>
            </div>

            <div class="mt-2 pt-1.5 flex justify-between items-center opacity-50 relative z-10 text-[7px] font-bold" style="border-top: 1px dashed #cbd5e1;">
                <p>ID: ${student.rollNo || '000'} | Generated: ${timestamp}</p>
                <p>© Police Modern School</p>
            </div>
        </div>
    `;
}

window.generateAdmitCard = async function(studentId, examType) {
    try {
        const studentResult = await firestoreHelper.getDocument('students', studentId);
        if (!studentResult.success) {
            alert('Student not found.');
            return;
        }
        
        const student = studentResult.data;
        const classId = student.class;
        
        // Load schedule
        const configId = `${classId}_${examType}`;
        const scheduleResult = await firestoreHelper.getDocument('exam_schedules', configId);
        
        if (!scheduleResult.success) {
            alert(`No default schedule found for Class ${formatClass(classId)} ${formatExamType(examType)}. Please click "Configure Schedule" first.`);
            return;
        }
        
        const schedule = scheduleResult.data;
        const timestamp = new Date().toLocaleString();
        
        // Open Modal
        document.getElementById('admit-card-modal').classList.remove('hidden');
        document.getElementById('admit-card-modal').classList.add('flex');
        
        // Render into modal content
        const contentContainer = document.getElementById('admit-card-content');
        contentContainer.innerHTML = renderAdmitCardHTML(student, examType, schedule, timestamp);

    } catch (e) {
        console.error(e);
        alert('Error generating admit card.');
    }
};

window.closeAdmitCardModal = function() {
    document.getElementById('admit-card-modal').classList.add('hidden');
    document.getElementById('admit-card-modal').classList.remove('flex');
};

window.printAdmitCard = function() {
    const content = document.getElementById('admit-card-content').innerHTML;
    const wrapper = document.getElementById('bulk-print-wrapper');
    wrapper.innerHTML = `<div class="print-page"><div class="print-card-box">${content}</div></div>`;
    window.print();
    setTimeout(() => { wrapper.innerHTML = ''; }, 1000);
};

window.bulkPrintAdmitCards = async function() {
    const classId = document.getElementById('exam-class-select').value;
    const examType = document.getElementById('exam-type-select').value;
    
    if (!classId) {
        alert('Please select a class first.');
        return;
    }
    
    // Load schedule preview/check
    const configId = `${classId}_${examType}`;
    const scheduleResult = await firestoreHelper.getDocument('exam_schedules', configId);
    
    if (!scheduleResult.success) {
        alert(`No default schedule found for Class ${formatClass(classId)}. Please "Configure Schedule" first.`);
        return;
    }
    
    const schedule = scheduleResult.data;
    const timestamp = new Date().toLocaleString();
    
    // Fetch all students for class
    showNotification('Loading class students for bulk printing...', 'info');
    const studentsResult = await firestoreHelper.getCollectionByQuery('students', 'class', '==', classId);
    
    if (!studentsResult.success || studentsResult.data.length === 0) {
        alert('No students found in this class.');
        return;
    }
    
    const students = studentsResult.data.sort((a,b) => (a.rollNo || 0) - (b.rollNo || 0));
    const wrapper = document.getElementById('bulk-print-wrapper');
    wrapper.innerHTML = '';
    
    students.forEach((student) => {
        // Create new page for every student (1 Card Per Page)
        const currentPage = document.createElement('div');
        currentPage.className = 'print-page';
        wrapper.appendChild(currentPage);
        
        const cardBox = document.createElement('div');
        cardBox.className = 'print-card-box';
        cardBox.innerHTML = renderAdmitCardHTML(student, examType, schedule, timestamp);
        currentPage.appendChild(cardBox);
    });
    
    showNotification(`Ready to print ${students.length} admit cards!`, 'success');
    window.print();
    
    setTimeout(() => { wrapper.innerHTML = ''; }, 2000);
};

window.openAddSalaryModal = function() {
    const modal = document.getElementById('add-salary-modal');
    if (!modal) return;
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    // Populate teacher dropdown
    const select = document.getElementById('salary-teacher-id');
    if (select) {
        select.innerHTML = '<option value="">Select Name</option>';
        if (typeof allTeachers !== 'undefined') {
            allTeachers.forEach(t => {
                const option = document.createElement('option');
                option.value = t.id;
                option.textContent = t.name;
                select.appendChild(option);
            });
        }
    }
};

window.closeAddSalaryModal = function() {
    const modal = document.getElementById('add-salary-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
};

window.handleSalaryTeacherChange = function() {
    const teacherId = document.getElementById('salary-teacher-id').value;
    const teacher = (typeof allTeachers !== 'undefined') ? allTeachers.find(t => t.id === teacherId) : null;
    if (teacher) {
        const classInput = document.getElementById('salary-display-class');
        if (classInput) classInput.value = formatClass(teacher.assignedClass || 'N/A');
        
        // Auto-fill daily rate if possible (suggested)
        const monthlySalary = parseFloat(teacher.salary) || 0;
        const rateInput = document.getElementById('salary-daily-rate');
        if (rateInput && monthlySalary > 0) {
            rateInput.value = Math.round(monthlySalary / 30);
        }
    }
    calculateManualSalary();
};

window.calculateManualSalary = function() {
    const dailyRate = parseFloat(document.getElementById('salary-daily-rate').value) || 0;
    const totalDays = parseFloat(document.getElementById('salary-total-days').value) || 30;
    const leaveDays = parseFloat(document.getElementById('salary-leave-days').value) || 0;
    const paidLeave = parseFloat(document.getElementById('salary-paid-leave').value) || 0;
    
    const effectiveDays = totalDays - (leaveDays - paidLeave);
    const grandTotal = Math.max(0, Math.round(dailyRate * effectiveDays));
    
    const calcTotalEl = document.getElementById('salary-calc-total');
    const totalTextEl = document.getElementById('salary-total-text');
    
    if (calcTotalEl) calcTotalEl.innerText = `₹${grandTotal.toLocaleString()}`;
    if (totalTextEl) totalTextEl.innerText = `${numberToWords(grandTotal)} Rupees Only`;
};

window.handleManualSalarySlip = async function(event) {
    if (event) event.preventDefault();
    
    const teacherId = document.getElementById('salary-teacher-id').value;
    const teacher = (typeof allTeachers !== 'undefined') ? allTeachers.find(t => t.id === teacherId) : null;
    if (!teacher) {
        alert('Please select a teacher.');
        return;
    }
    
    const monthYear = document.getElementById('salary-month-year').value;
    if (!monthYear) {
        alert('Please select month and year.');
        return;
    }
    
    const [year, month] = monthYear.split('-');
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthName = months[parseInt(month) - 1];
    
    const calcTotalStr = document.getElementById('salary-calc-total').innerText;
    const grandTotal = parseInt(calcTotalStr.replace(/[^\d]/g, '')) || 0;
    
    // Show the preview modal
    const previewModal = document.getElementById('salary-slip-modal');
    if (previewModal) {
        previewModal.classList.remove('hidden');
        previewModal.classList.add('flex');
        
        // Populate preview elements safely
        const setElText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.innerText = text;
        };

        setElText('slip-teacher-name', teacher.name || '---');
        setElText('slip-teacher-subject', teacher.subject || 'Teacher');
        setElText('slip-teacher-id', teacher.id.substring(0, 8).toUpperCase());
        setElText('slip-month-year', `For the month of ${monthName} ${year}`);
        
        const dailyRate = parseFloat(document.getElementById('salary-daily-rate').value) || 0;
        const totalDays = parseFloat(document.getElementById('salary-total-days').value) || 30;
        const leaveDays = parseFloat(document.getElementById('salary-leave-days').value) || 0;
        const paidLeave = parseFloat(document.getElementById('salary-paid-leave').value) || 0;
        
        const basicSalary = dailyRate * totalDays;
        const totalDeds = dailyRate * (leaveDays - paidLeave);
        
        setElText('slip-basic-pay', `₹${basicSalary.toLocaleString()}`);
        setElText('slip-gross-total', `₹${basicSalary.toLocaleString()}`);
        setElText('slip-total-deductions', `₹${Math.max(0, totalDeds).toLocaleString()}`);
        setElText('slip-net-salary', `₹${grandTotal.toLocaleString()}`);
        
        // --- PERSISTENCE: Save to Firestore ---
        const salaryData = {
            teacherId: teacher.id,
            teacherName: teacher.name,
            month: month,
            year: year,
            monthYear: monthYear,
            dailyRate: dailyRate,
            totalDays: totalDays,
            leaveDays: leaveDays,
            paidLeave: paidLeave,
            netSalary: grandTotal,
            createdAt: new Date().toISOString()
        };

        const docId = `${teacher.id}_${monthYear}`;
        
        try {
            const res = await firestoreHelper.setDocument('salary_slips', docId, salaryData);
            if(res.success) {
                console.log('Salary slip saved successfully to Firestore:', docId);
                alert(`Salary slip for ${teacher.name} (${monthName} ${year}) generated and saved successfully.`);
            } else {
                console.error('Firestore Save Error:', res.error);
                alert('Database Error: Salary slip generated but could not be saved. ' + res.error);
            }
        } catch (dbErr) {
            console.error('Firestore Exception:', dbErr);
            alert('Database Exception: ' + dbErr.message);
        }
        
        closeAddSalaryModal();
    }
};

function numberToWords(number) {
    if (number === 0) return 'Zero';
    
    const first = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const thousands = ['', 'Thousand', 'Million', 'Billion'];
    
    function helper(n) {
        if (n < 20) return first[n];
        if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + first[n % 10] : '');
        if (n < 1000) return first[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + helper(n % 100) : '');
        return '';
    }
    
    let res = '';
    let i = 0;
    while (number > 0) {
        if (number % 1000 !== 0) {
            res = helper(number % 1000) + (thousands[i] ? ' ' + thousands[i] : '') + (res ? ' ' + res : '');
        }
        number = Math.floor(number / 1000);
        i++;
    }
    return res.trim();
}

window.openViewSalaryModal = function() {
    const modal = document.getElementById('view-salary-modal');
    if (!modal) return;
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    // Populate teacher dropdown
    const select = document.getElementById('view-salary-teacher-id');
    if (select) {
        select.innerHTML = '<option value="">Select Teacher</option>';
        if (typeof allTeachers !== 'undefined') {
            allTeachers.forEach(t => {
                const option = document.createElement('option');
                option.value = t.id;
                option.textContent = t.name;
                select.appendChild(option);
            });
        }
    }
};

window.closeViewSalaryModal = function() {
    const modal = document.getElementById('view-salary-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
};

window.handleViewSalaryTeacherChange = async function() {
    const teacherId = document.getElementById('view-salary-teacher-id').value;
    const table = document.getElementById('salary-history-table');
    const tbody = document.getElementById('salary-history-body');
    const statusEl = document.getElementById('view-history-status');
    
    if (!teacherId) {
        if (table) table.classList.add('hidden');
        if (statusEl) {
            statusEl.classList.remove('hidden');
            statusEl.innerHTML = '<i class="fas fa-arrow-up block text-3xl mb-2 opacity-20"></i>Select a teacher to load history';
        }
        return;
    }

    if (statusEl) {
        statusEl.innerText = 'Loading payment history...';
        statusEl.classList.remove('hidden');
    }
    if (table) table.classList.add('hidden');

    try {
        console.log('Fetching salary history for teacher:', teacherId);
        // Fetch all slips for this teacher
        const result = await firestoreHelper.getDocuments('salary_slips', [where('teacherId', '==', teacherId)]);
        
        console.log('Firestore results:', result);

        if (!result.success) {
            if (statusEl) statusEl.innerText = 'Database error: ' + (result.error || 'Unknown error');
            return;
        }

        if (result.data.length === 0) {
            if (statusEl) statusEl.innerText = 'No salary records found for this teacher in the database.';
            return;
        }

        // Sort by year and month (descending)
        const slips = result.data.sort((a, b) => {
            const dateA = new Date(a.year, a.month - 1);
            const dateB = new Date(b.year, b.month - 1);
            return dateB - dateA;
        });

        const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

        if (tbody) {
            tbody.innerHTML = slips.map(slip => {
                const monthName = months[parseInt(slip.month) - 1];
                const docId = `${slip.teacherId}_${slip.monthYear}`;
                return `
                    <tr class="hover:bg-gray-50 transition-colors">
                        <td class="px-3 py-3 font-bold text-gray-700">${monthName} ${slip.year}</td>
                        <td class="px-3 py-3 text-right font-mono text-blue-700 font-bold">₹${slip.netSalary.toLocaleString()}</td>
                        <td class="px-3 py-3 text-center">
                            <div class="flex justify-center gap-1">
                                <button onclick="viewSalaryDetails('${docId}')" class="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="View/Print">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <button onclick="editSalarySlip('${docId}')" class="p-1.5 text-green-600 hover:bg-green-50 rounded" title="Modify">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button onclick="deleteSalarySlip('${docId}', '${teacherId}')" class="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Delete">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        }
        if (statusEl) statusEl.classList.add('hidden');
        if (table) table.classList.remove('hidden');

    } catch (error) {
        console.error('Error loading salary history:', error);
        if (statusEl) statusEl.innerText = 'Error loading history.';
    }
};

window.viewAcademicResult = function(studentId, examName) {
    if (!window._currentClassResults || !window._currentExamLabel) {
        alert("Please load class results first.");
        return;
    }

    const student = window._currentClassResults.find(s => s.id === studentId);
    if (!student) {
        alert("Student data not found in current list.");
        return;
    }

    if (!student._hasMarks || !student._results) {
        alert(`No results found for ${student.studentName || student.name} in this exam.`);
        return;
    }

    document.getElementById('result-student-name').innerText = student.studentName || student.name;
    document.getElementById('result-roll-no').innerText = student.rollNumber || '---';
    document.getElementById('result-exam-name').innerText = window._currentExamLabel;

    const tbody = document.getElementById('result-subjects-body');
    let html = '';
    
    // Sort subjects standard order if possible
    const standardSubjects = ['hindi', 'english', 'math', 'science', 'sst', 'computer', 'art', 'gk'];
    const resultsObj = student._results;
    
    // Extract keys and try to sort
    let subjects = Object.keys(resultsObj);
    subjects.sort((a, b) => {
        let idxA = standardSubjects.indexOf(a.toLowerCase());
        let idxB = standardSubjects.indexOf(b.toLowerCase());
        if(idxA === -1) idxA = 999;
        if(idxB === -1) idxB = 999;
        return idxA - idxB;
    });

    subjects.forEach(sub => {
        const val = parseInt(resultsObj[sub] || 0);
        let colorClass = "text-gray-800";
        if(val < 33) colorClass = "text-red-600 font-bold";
        
        html += `
            <tr class="transition-colors hover:bg-gray-50">
                <td class="px-4 py-2 text-left capitalize">${sub}</td>
                <td class="px-4 py-2 text-right text-gray-500">100</td>
                <td class="px-4 py-2 text-right ${colorClass}">${val}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;

    document.getElementById('result-total-max').innerText = student._max;
    document.getElementById('result-total-obtained').innerText = student._obtained;
    
    const percEl = document.getElementById('result-percentage');
    percEl.innerText = `${student._percentage}%`;
    percEl.className = student._percentage < 33 ? "text-lg font-black text-red-600" : "text-lg font-black text-gray-800";

    const gradeEl = document.getElementById('result-grade');
    gradeEl.innerText = student._grade;
    gradeEl.className = student._grade === 'E' || student._grade === 'F' ? "text-lg font-black text-red-600" : "text-lg font-black text-green-600";
    
    document.getElementById('result-rank').innerText = student._rank;

    const modal = document.getElementById('result-view-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

window.closeAcademicResultModal = function() {
    const modal = document.getElementById('result-view-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
};

window.viewSalaryDetails = async function(docId) {
    try {
        const result = await firestoreHelper.getDocument('salary_slips', docId);
        if (!result.success || !result.data) return;

        const data = result.data;
        const teacher = (typeof allTeachers !== 'undefined') ? allTeachers.find(t => t.id === data.teacherId) : null;

        // Show the preview modal
        const previewModal = document.getElementById('salary-slip-modal');
        if (previewModal) {
            previewModal.classList.remove('hidden');
            previewModal.classList.add('flex');
            
            const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            const monthName = months[parseInt(data.month) - 1];

            const setElText = (id, text) => {
                const el = document.getElementById(id);
                if (el) el.innerText = text;
            };

            setElText('slip-teacher-name', data.teacherName || (teacher ? teacher.name : '---'));
            setElText('slip-teacher-subject', (teacher ? teacher.subject : 'Teacher'));
            setElText('slip-teacher-id', data.teacherId.substring(0, 8).toUpperCase());
            setElText('slip-month-year', `For the month of ${monthName} ${data.year}`);
            
            const basicSalary = data.dailyRate * data.totalDays;
            const totalDeds = data.dailyRate * (data.leaveDays - data.paidLeave);
            
            setElText('slip-basic-pay', `₹${basicSalary.toLocaleString()}`);
            setElText('slip-gross-total', `₹${basicSalary.toLocaleString()}`);
            setElText('slip-total-deductions', `₹${Math.max(0, totalDeds).toLocaleString()}`);
            setElText('slip-net-salary', `₹${data.netSalary.toLocaleString()}`);
        }
    } catch (e) {
        console.error(e);
    }
};

window.editSalarySlip = async function(docId) {
    try {
        const result = await firestoreHelper.getDocument('salary_slips', docId);
        if (!result.success || !result.data) return;

        const data = result.data;
        
        // Close history modal and open add modal
        closeViewSalaryModal();
        openAddSalaryModal();

        // Populate add-salary-modal for modification
        setTimeout(() => {
            const teacherSelect = document.getElementById('salary-teacher-id');
            if (teacherSelect) teacherSelect.value = data.teacherId;
            
            const monthInput = document.getElementById('salary-month-year');
            if (monthInput) monthInput.value = data.monthYear;
            
            document.getElementById('salary-daily-rate').value = data.dailyRate;
            document.getElementById('salary-total-days').value = data.totalDays;
            document.getElementById('salary-leave-days').value = data.leaveDays;
            document.getElementById('salary-paid-leave').value = data.paidLeave;
            
            calculateManualSalary();
            handleSalaryTeacherChange();
        }, 100);

    } catch (e) {
        console.error(e);
    }
};

window.deleteSalarySlip = async function(docId, teacherId) {
    if (!confirm('Are you sure you want to delete this salary record?')) return;

    try {
        const res = await firestoreHelper.deleteDocument('salary_slips', docId);
        if (res.success) {
            alert('Record deleted successfully.');
            handleViewSalaryTeacherChange(); // Refresh list
        }
    } catch (e) {
        console.error(e);
        alert('Error deleting record.');
    }
};

