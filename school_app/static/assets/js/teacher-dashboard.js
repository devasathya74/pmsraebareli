import { auth, db, authHelper, firestoreHelper, onAuthStateChanged, collection, query, where, getDocs, doc, setDoc, addDoc, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from './firebase-config.js';

let currentUser = null;
let currentTeacherProfile = null;
let myStudents = [];

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', async () => {
    // Set default date for attendance
    document.getElementById('attendance-date').valueAsDate = new Date();

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            await loadTeacherProfile(user.email);
        } else {
            window.location.href = 'login.html';
        }
    });
});

async function loadTeacherProfile(email) {
    try {
        // Primary source: use the already-loaded session user (has assignedClass from users table)
        const sessionUser = authHelper.getCurrentUser();

        if (sessionUser) {
            currentTeacherProfile = {
                id: sessionUser.uid || sessionUser.id,
                name: sessionUser.name || sessionUser.displayName || email,
                email: sessionUser.email || email,
                assignedClass: sessionUser.assignedClass || '',
                photo: null,
            };
        }

        // Enrich with teachers collection profile (for photo, subject, etc.)
        try {
            const teachersResult = await firestoreHelper.getDocuments('teachers');
            if (teachersResult.success && teachersResult.data.length > 0) {
                const profile = teachersResult.data[0]; // scoped to this teacher by backend
                currentTeacherProfile.photo = profile.photo || null;
                // If assignedClass is missing from user record, take it from teachers profile
                if (!currentTeacherProfile.assignedClass) {
                    currentTeacherProfile.assignedClass = profile.assignedClass || profile.assigned_class || '';
                }
                if (!currentTeacherProfile.name || currentTeacherProfile.name === email) {
                    currentTeacherProfile.name = profile.name || currentTeacherProfile.name;
                }
            }
        } catch (profileErr) {
            console.warn('Could not load teacher profile details:', profileErr);
        }

        if (!currentTeacherProfile || !currentTeacherProfile.name) {
            alert('Access Denied. Teacher profile not found.');
            authHelper.logout();
            return;
        }

        // UI Updates
        const nameSidebar = document.getElementById('teacher-name-sidebar');
        if (nameSidebar) nameSidebar.textContent = currentTeacherProfile.name;
        const headerName = document.getElementById('teacher-name-header');
        if (headerName) headerName.textContent = currentTeacherProfile.name;

        // Update Date
        const dateElement = document.getElementById('current-date');
        if (dateElement) {
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            dateElement.textContent = new Date().toLocaleDateString('en-US', options);
        }

        // Update Profile Photo
        const photoUrl = currentTeacherProfile.photo || '../assets/images/logo/logo.png';
        const headerImg = document.getElementById('teacher-profile-img');
        const sidebarImg = document.getElementById('sidebar-profile-img');
        if (headerImg) headerImg.src = photoUrl;
        if (sidebarImg) sidebarImg.src = photoUrl;

        const classHeader = document.getElementById('class-name-header');
        if (classHeader) classHeader.textContent = `Class ${currentTeacherProfile.assignedClass || 'Unassigned'}`;

        if (currentTeacherProfile.assignedClass) {
            await loadStudents(currentTeacherProfile.assignedClass);
        } else {
            alert('You have not been assigned a class yet. Please contact the administrator.');
        }
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

async function loadStudents(className) {
    const tableBody = document.getElementById('students-table-body');
    const progressBody = document.getElementById('progress-table-body');
    tableBody.innerHTML = '<tr><td colspan="5" class="p-4 text-center">Loading...</td></tr>';

    // 1. Get students for this class
    // Note: Assuming 'students' collection has a 'class' field.
    const result = await firestoreHelper.getDocuments('students', [where('class', '==', className)]);

    if (result.success) {
        myStudents = result.data;
        // Sort by Roll Number (Numeric)
        myStudents.sort((a, b) => {
            const r1 = parseInt(a.rollNumber) || 999999;
            const r2 = parseInt(b.rollNumber) || 999999;
            return r1 - r2;
        });

        document.getElementById('stat-total-students').textContent = myStudents.length;

        // Render Students List
        renderStudentList(myStudents);

        // Render Progress List
        renderProgressList(myStudents);

        // Render Attendance List (Initial)
        renderAttendanceList(myStudents);
    } else {
        tableBody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-red-500">Error: ${result.error}</td></tr>`;
    }
}

function renderStudentList(students) {
    const tbody = document.getElementById('students-table-body');
    if (students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">No students found in this class.</td></tr>';
        return;
    }

    tbody.innerHTML = students.map(student => `
        <tr class="hover:bg-gray-50 border-b last:border-0 transition">
            <td class="p-4 font-medium text-gray-800">${student.studentName || student.name}</td>
            <td class="p-4 text-gray-600">${student.rollNumber || '-'}</td>
            <td class="p-4 text-gray-600">${student.fatherName || '-'}</td>
            <td class="p-4 text-gray-600">${student.mobile || '-'}</td>
            <td class="p-4 flex gap-3 items-center">
                <button onclick="viewStudentDetails('${student.id}')" class="text-blue-600 hover:text-blue-800 text-sm font-semibold whitespace-nowrap"><i class="fas fa-user-circle mr-1"></i>View Details</button>
                <button onclick="viewFeeDetails('${student.id}')" class="text-green-600 hover:text-green-800 text-sm font-semibold whitespace-nowrap"><i class="fas fa-rupee-sign mr-1"></i>View Fee</button>
            </td>
        </tr>
    `).join('');
}

// NEW: Render Progress List with Filter
function renderProgressList(students) {
    const tbody = document.getElementById('progress-table-body');
    const filter = document.getElementById('progress-exam-filter').value;
    const examKey = filter.replace(/\s+/g, '_'); // "Unit Test 1" -> "Unit_Test_1"

    if (students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-gray-500">No students found.</td></tr>';
        return;
    }

    // Process stats for ranking
    const studentsWithStats = students.map(student => {
        let obtained = 0;
        let max = 0;
        let percentage = 0;
        let hasMarks = false;
        let grade = 'A';
        
        if (student.examMarks && student.examMarks[examKey]) {
            const data = student.examMarks[examKey];
            const results = data.results || {};
            const keys = Object.keys(results);
            if (keys.length > 0) {
                hasMarks = true;
                obtained = keys.reduce((sum, key) => sum + parseInt(results[key] || 0), 0);
                max = keys.length * 100;
                percentage = parseFloat(data.percentage || 0);
                let checkPerc = Math.round(percentage);
                grade = data.grade || (checkPerc >= 90 ? 'A+' : checkPerc >= 80 ? 'A' : checkPerc >= 70 ? 'B+' : checkPerc >= 60 ? 'B' : checkPerc >= 50 ? 'C' : checkPerc >= 33 ? 'D' : 'E');
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

    // Sort by percentage descending to assign Rank
    studentsWithStats.sort((a, b) => b._percentage - a._percentage);
    
    let currentRank = 1; let lastPerc = null; let skip = 0;
    studentsWithStats.forEach(s => {
        if (!s._hasMarks) s._rank = '-';
        else {
            if (s._percentage === lastPerc) { s._rank = currentRank; skip++; }
            else { currentRank += skip; s._rank = currentRank; skip = 1; lastPerc = s._percentage; }
        }
    });

    // Store globally for Modal usage
    window._currentClassResults = studentsWithStats;
    window._currentExamLabel = filter;

    // Sort alphabetically for display
    studentsWithStats.sort((a, b) => (a.studentName || a.name || '').localeCompare(b.studentName || b.name || ''));

    tbody.innerHTML = studentsWithStats.map(student => {
        let marksHtml = '-';
        let gradeHtml = '-';

        if (student._hasMarks) {
            marksHtml = `<div class="font-black text-blue-900 leading-tight">${student._obtained}/${student._max} <span class="text-xs text-gray-500 font-bold">(${student._percentage}%)</span></div>`;
            gradeHtml = `Grade: <span class="text-green-700">${student._grade}</span> | Rank: <span class="text-blue-700">${student._rank}</span>`;
        }

        return `
        <tr class="hover:bg-gray-50 border-b">
            <td class="p-4 font-bold text-gray-800">${student.studentName || student.name}</td>
            <td class="p-4 text-center">
                ${marksHtml !== '-' ? marksHtml : '<div class="text-sm font-bold text-gray-400">-</div>'}
                ${gradeHtml !== '-' ? `<div class="text-[10px] font-bold text-gray-500 uppercase mt-1 tracking-tight">${gradeHtml}</div>` : ''}
            </td>
            <td class="p-4 flex flex-wrap gap-2 items-center justify-center">
                <button onclick="openMarksModal('${student.id}', '${student.studentName || student.name}')" 
                    title="Update Marks"
                    class="bg-blue-50 text-blue-700 w-8 h-8 rounded-full shadow hover:bg-blue-800 hover:text-white transition-all text-sm font-bold flex items-center justify-center">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="viewAcademicResult('${student.id}')" 
                    title="View Result"
                    class="bg-blue-900 border text-white w-8 h-8 rounded-full shadow hover:bg-blue-800 transition-all text-sm font-bold flex items-center justify-center">
                    <i class="fas fa-eye"></i>
                </button>
                <button onclick="viewFeeDetails('${student.id}')" 
                    title="View Fee"
                    class="bg-green-600 text-white w-8 h-8 rounded-full shadow hover:bg-green-800 transition-all text-sm font-bold flex items-center justify-center">
                    <i class="fas fa-rupee-sign"></i>
                </button>
            </td>
        </tr>
    `}).join('');
}

window.viewAcademicResult = function(studentId) {
    if (!window._currentClassResults || !window._currentExamLabel) {
        alert("Please load class results first.");
        return;
    }
    const student = window._currentClassResults.find(s => s.id === studentId);
    if (!student || !student._hasMarks || !student._results) {
        alert("No complete results found.");
        return;
    }

    document.getElementById('result-student-name').innerText = student.studentName || student.name;
    document.getElementById('result-roll-no').innerText = student.rollNumber || '---';
    document.getElementById('result-exam-name').innerText = window._currentExamLabel;

    const tbody = document.getElementById('result-subjects-body');
    let html = '';
    const standardSubjects = ['hindi', 'english', 'math', 'science', 'sst', 'computer', 'art', 'gk'];
    const resultsObj = student._results;
    
    let subjects = Object.keys(resultsObj);
    subjects.sort((a, b) => {
        let idxA = standardSubjects.indexOf(a.toLowerCase());
        let idxB = standardSubjects.indexOf(b.toLowerCase());
        return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
    });

    subjects.forEach(sub => {
        const val = parseInt(resultsObj[sub] || 0);
        let colorClass = val < 33 ? "text-red-600 font-bold" : "text-gray-800";
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
    percEl.innerText = student._percentage + '%';
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


// Global Filter Function
window.filterProgress = function () {
    renderProgressList(myStudents);
};

// Re-added renderAttendanceList
function renderAttendanceList(students) {
    const container = document.getElementById('attendance-list');
    container.innerHTML = students.map(student => `
        <div class="flex items-center justify-between p-3 border rounded-lg hover:shadow-sm bg-gray-50">
            <span class="font-medium text-gray-700">${student.studentName || student.name}</span>
            <div class="flex gap-4">
                <label class="flex items-center cursor-pointer">
                    <input type="checkbox" value="${student.id}" class="attendance-present w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500" checked>
                    <span class="ml-2 text-sm font-medium text-green-700">Present</span>
                </label>
                <label class="flex items-center cursor-pointer">
                    <input type="checkbox" value="${student.id}" class="attendance-absent w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500">
                    <span class="ml-2 text-sm font-medium text-red-700">Absent</span>
                </label>
            </div>
        </div>
    `).join('');

    // Add listeners to ensure only one checkbox is selected at a time (radio-like behavior)
    document.querySelectorAll('.attendance-present, .attendance-absent').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                const studentId = e.target.value;
                const isPresent = e.target.classList.contains('attendance-present');

                // Find the other checkbox for this student and uncheck it
                const otherClass = isPresent ? 'attendance-absent' : 'attendance-present';
                const otherCheckbox = document.querySelector(`.${otherClass}[value="${studentId}"]`);
                if (otherCheckbox) {
                    otherCheckbox.checked = false;
                }
            } else {
                // Prevent unchecking - at least one must be selected
                // If user tries to uncheck, check the other one
                const studentId = e.target.value;
                const isPresent = e.target.classList.contains('attendance-present');
                const otherClass = isPresent ? 'attendance-absent' : 'attendance-present';
                const otherCheckbox = document.querySelector(`.${otherClass}[value="${studentId}"]`);
                if (otherCheckbox && !otherCheckbox.checked) {
                    e.target.checked = true; // Keep current checked
                }
            }
        });
    });
}

// Global functions for HTML interaction
// NEW: View Student Details
window.viewStudentDetails = function (id) {
    const student = myStudents.find(s => s.id === id);
    if (!student) return;

    document.getElementById('detail-name').textContent = student.studentName || student.name;
    document.getElementById('detail-roll').textContent = "Roll No: " + (student.rollNumber || 'N/A');
    document.getElementById('detail-photo').src = student.photo || '../assets/images/logo.png';

    document.getElementById('detail-dob').textContent = student.dob || '-';
    document.getElementById('detail-gender').textContent = student.gender || '-';
    document.getElementById('detail-address').textContent = student.address || '-';

    document.getElementById('detail-father').textContent = student.fatherName || '-';
    document.getElementById('detail-mother').textContent = student.motherName || '-';
    document.getElementById('detail-mobile').textContent = student.mobile || '-';

    document.getElementById('student-modal').classList.remove('hidden');
};

// NEW: View Fee Details
window.viewFeeDetails = async function (id) {
    const student = myStudents.find(s => s.id === id);
    if (!student) return;

    document.getElementById('fee-student-name').textContent = student.studentName || student.name;
    const tbody = document.getElementById('student-fee-tbody');
    tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-gray-500"><i class="fas fa-spinner fa-spin mr-2"></i>Loading fee details...</td></tr>';
    
    const modal = document.getElementById('teacher-fee-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    try {
        const q = query(collection(db, 'fees'), where('studentId', '==', id));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-red-500 font-medium">No fee records found for this student. Please ask them to submit their fees.</td></tr>';
            return;
        }

        const fees = snapshot.docs.map(doc => doc.data());
        // Sort by date descending (supports both timestamp and submittedAt fields)
        fees.sort((a, b) => new Date(b.timestamp || b.submittedAt) - new Date(a.timestamp || a.submittedAt));

        tbody.innerHTML = fees.map(f => {
            const dateStr = f.timestamp || f.submittedAt || '';
            const displayDate = dateStr ? new Date(dateStr).toLocaleDateString() : '-';
            return `
            <tr class="hover:bg-gray-50 border-b">
                <td class="p-4 text-gray-800 font-medium">${displayDate}</td>
                <td class="p-4 text-gray-600">${f.month || '-'} ${f.year || ''}</td>
                <td class="p-4 text-green-700 font-bold">₹${f.amount || 0}</td>
            </tr>`;
        }).join('');
    } catch (error) {
        console.error("Error fetching fee details:", error);
        tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-red-500">Error loading fee records.</td></tr>';
    }
};

window.closeFeeModal = function() {
    const modal = document.getElementById('teacher-fee-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
};

// NEW: Load Attendance History
window.loadAttendanceHistory = async function () {
    if (!currentTeacherProfile) return;
    const date = document.getElementById('attendance-date').value;
    if (!date) { alert('Please select a date first.'); return; }

    const docId = `${currentTeacherProfile.assignedClass}_${date}`;
    const result = await firestoreHelper.getDocument('attendance', docId);

    if (result.success && result.data) {
        const records = result.data.records || {};
        // Update checkboxes based on history
        Object.keys(records).forEach(studentId => {
            const status = records[studentId];
            const presentCheckbox = document.querySelector(`.attendance-present[value="${studentId}"]`);
            const absentCheckbox = document.querySelector(`.attendance-absent[value="${studentId}"]`);

            if (presentCheckbox && absentCheckbox) {
                if (status === 'present') {
                    presentCheckbox.checked = true;
                    absentCheckbox.checked = false;
                } else {
                    presentCheckbox.checked = false;
                    absentCheckbox.checked = true;
                }
            }
        });
        alert(`Loaded attendance for ${date}.`);
    } else {
        alert(`No attendance record found for ${date}.`);
    }
};

window.saveAttendance = async function () {
    if (!currentTeacherProfile || !myStudents.length) return;

    const date = document.getElementById('attendance-date').value;
    if (!date) { alert('Please select a date'); return; }

    const records = {};
    let presentCount = 0;

    // Collect attendance from present checkboxes
    document.querySelectorAll('.attendance-present').forEach(checkbox => {
        const studentId = checkbox.value;
        const isPresent = checkbox.checked;
        records[studentId] = isPresent ? 'present' : 'absent';
        if (isPresent) presentCount++;
    });

    const attendanceData = {
        date: date,
        class: currentTeacherProfile.assignedClass,
        teacherId: currentTeacherProfile.id,
        teacherName: currentTeacherProfile.name,
        totalStudents: myStudents.length,
        presentCount: presentCount,
        records: records,
        timestamp: new Date().toISOString()
    };

    // Save to 'attendance' collection. ID format: class_date (e.g., 5_2023-10-27) to prevent duplicates/easy fetch
    const docId = `${currentTeacherProfile.assignedClass}_${date}`;

    try {
        await setDoc(doc(db, 'attendance', docId), attendanceData);
        alert('Attendance saved successfully!');
        document.getElementById('stat-present-today').textContent = presentCount; // Simple client update
    } catch (error) {
        console.error('Error saving attendance:', error);
        alert('Failed to save attendance: ' + error.message);
    }
};

window.openMarksModal = function (id, name) {
    document.getElementById('marks-student-id').value = id;
    document.getElementById('marks-student-name').textContent = name;
    document.getElementById('marks-modal').classList.remove('hidden');
};

window.saveStudentMarks = async function () {
    const id = document.getElementById('marks-student-id').value;
    const exam = document.getElementById('exam-name').value;
    const examKey = exam.replace(/\s+/g, '_'); // Create key for map

    // Collect all subjects
    const subjects = ['hindi', 'english', 'math', 'science', 'sst', 'computer', 'art', 'gk'];
    const results = {};
    let total = 0;
    let count = 0;

    subjects.forEach(sub => {
        const val = document.getElementById(`marks-${sub}`).value;
        if (val) {
            results[sub] = parseInt(val);
            total += parseInt(val);
            count++;
        }
    });

    if (count === 0) { alert('Please enter marks for at least one subject.'); return; }

    const percentage = count > 0 ? (total / (count * 100) * 100).toFixed(2) : 0;

    // Data to save inside the map
    const examData = {
        examName: exam,
        results: results,
        percentage: percentage,
        updatedAt: new Date().toISOString()
    };

    try {
        // Save to 'examMarks' map field in student document
        // We use dot notation to update only this specific key in the map
        const updateData = {};
        updateData[`examMarks.${examKey}`] = examData;
        updateData.updatedAt = new Date().toISOString();

        // Also update legacy field for backward compatibility if needed, or just remove it
        updateData.lastExamMarks = `${percentage}% (${exam})`;

        await firestoreHelper.updateDocument('students', id, updateData);

        alert('Report Card Saved!');
        document.getElementById('marks-modal').classList.add('hidden');

        // Reload students to get fresh data
        loadStudents(currentTeacherProfile.assignedClass);

    } catch (error) {
        alert('Error: ' + error.message);
    }
};

window.sendReport = async function (e) {
    e.preventDefault();
    const subject = document.getElementById('report-subject').value;
    const message = document.getElementById('report-message').value;

    const reportData = {
        type: 'teacher_report',
        fromName: currentTeacherProfile.name,
        fromId: currentTeacherProfile.id,
        fromClass: currentTeacherProfile.assignedClass,
        subject: subject,
        message: message,
        date: new Date().toISOString(),
        read: false
    };

    try {
        await firestoreHelper.addDocument('messages', reportData);
        alert('Report sent to Principal successfully!');
        document.getElementById('report-form').reset();
    } catch (error) {
        alert('Failed to send report: ' + error.message);
    }
};

// Make logout available
window.authHelper = authHelper;
window.loadStudents = () => loadStudents(currentTeacherProfile?.assignedClass);

// ========== SALARY SLIPS ==========

window.loadSalarySlips = async function () {
    if (!currentTeacherProfile) return;
    const tbody = document.getElementById('salary-slips-tbody');
    tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-gray-400"><i class="fas fa-spinner fa-spin text-2xl mb-2 block"></i>Loading...</td></tr>`;

    try {
        // Let the backend scope_documents() filter to this teacher's slips automatically
        const result = await firestoreHelper.getDocuments('salary_slips');

        if (!result.success || !result.data || result.data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-gray-500 italic"><i class="fas fa-file-invoice-dollar text-3xl mb-2 block text-gray-300"></i>No salary slips issued yet. Please contact the administrator.</td></tr>`;
            document.getElementById('salary-total-slips').textContent = '0';
            document.getElementById('salary-last-net').textContent = '₹0';
            document.getElementById('salary-latest-month').textContent = 'N/A';
            return;
        }


        const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
        const slips = result.data.slice(); // already scoped by backend to this teacher
        // Sort newest first
        slips.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Update summary cards
        document.getElementById('salary-total-slips').textContent = slips.length;
        document.getElementById('salary-last-net').textContent = `₹${(slips[0].netSalary || 0).toLocaleString()}`;
        const latestMonth = months[(parseInt(slips[0].month, 10) - 1)] || slips[0].month;
        document.getElementById('salary-latest-month').textContent = `${latestMonth} ${slips[0].year}`;

        // Store for modal usage
        window._teacherSalarySlips = slips;

        tbody.innerHTML = slips.map((slip, idx) => {
            const monthName = months[(parseInt(slip.month, 10) - 1)] || slip.month;
            const issuedOn = slip.createdAt ? new Date(slip.createdAt).toLocaleDateString('en-IN') : '---';
            const netColor = slip.netSalary >= 10000 ? 'text-green-700' : 'text-orange-600';
            return `
            <tr class="hover:bg-indigo-50 border-b last:border-0 transition">
                <td class="p-4 font-bold text-gray-800">${monthName} ${slip.year}</td>
                <td class="p-4 text-gray-600">${slip.totalDays || '-'} days</td>
                <td class="p-4 text-gray-600">${slip.leaveDays || 0} days</td>
                <td class="p-4 ${netColor} font-bold">₹${(slip.netSalary || 0).toLocaleString()}</td>
                <td class="p-4 text-gray-500 text-sm">${issuedOn}</td>
                <td class="p-4">
                    <button onclick="viewTeacherSalarySlip(${idx})"
                        class="flex items-center gap-2 bg-indigo-700 text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-indigo-800 transition-colors shadow-sm">
                        <i class="fas fa-eye"></i> View Slip
                    </button>
                </td>
            </tr>`;
        }).join('');
    } catch (err) {
        console.error('Error loading salary slips:', err);
        tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500">Error loading salary slips. Please try again.</td></tr>`;
    }
};

window.viewTeacherSalarySlip = function (idx) {
    const slip = window._teacherSalarySlips?.[idx];
    if (!slip) return;

    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const monthName = months[(parseInt(slip.month, 10) - 1)] || slip.month;
    const basicPay = (slip.dailyRate || 0) * (slip.totalDays || 0);
    const unpaidLeave = Math.max(0, (slip.leaveDays || 0) - (slip.paidLeave || 0));
    const deduction = Math.round((slip.dailyRate || 0) * unpaidLeave);
    const issuedOn = slip.createdAt ? new Date(slip.createdAt).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '---';

    document.getElementById('tss-name').textContent = (slip.teacherName || '---').toUpperCase();
    document.getElementById('tss-month-year').textContent = `${monthName} ${slip.year}`;
    document.getElementById('tss-daily-rate').textContent = `₹${(slip.dailyRate || 0).toLocaleString()} per day`;
    document.getElementById('tss-total-days').textContent = `${slip.totalDays || 0} days`;
    document.getElementById('tss-basic-pay').textContent = `₹${basicPay.toLocaleString()}`;
    document.getElementById('tss-leave-info').textContent = `(${unpaidLeave} unpaid day${unpaidLeave !== 1 ? 's' : ''})`;
    document.getElementById('tss-deduction').textContent = `-₹${deduction.toLocaleString()}`;
    document.getElementById('tss-net-salary').textContent = `₹${(slip.netSalary || 0).toLocaleString()}`;
    document.getElementById('tss-issued-on').textContent = `Issued on: ${issuedOn}`;

    const modal = document.getElementById('teacher-salary-slip-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

window.closeTeacherSalarySlipModal = function () {
    const modal = document.getElementById('teacher-salary-slip-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
};

window.printTeacherSalarySlip = function () {
    const content = document.getElementById('teacher-salary-slip-printable').innerHTML;
    const pw = window.open('', '_blank');
    pw.document.write(`<html><head><title>Salary Slip</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css">
        <style>@media print { body { margin: 0; padding: 20px; } }</style>
        </head><body>${content}</body></html>`);
    pw.document.close();
    setTimeout(() => pw.print(), 500);
};


window.showToast = function (type, message) {
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 z-[99999] px-6 py-3 rounded-lg shadow-lg transform transition-all duration-300 translate-y-0 ${type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`;
    toast.innerHTML = `
        <div class="flex items-center gap-2">
            <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
            <span class="font-bold">${message}</span>
        </div>
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('-translate-y-full', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

// User Profile & Password Management
window.toggleUserDropdown = function () {
    const dropdown = document.getElementById('user-dropdown');
    dropdown.classList.toggle('hidden');
    // Close if clicked outside
    if (!dropdown.classList.contains('hidden')) {
        document.addEventListener('click', closeDropdownOnClickOutside);
    } else {
        document.removeEventListener('click', closeDropdownOnClickOutside);
    }
}

function closeDropdownOnClickOutside(e) {
    const dropdown = document.getElementById('user-dropdown');
    const button = document.querySelector('button[onclick="toggleUserDropdown()"]');
    if (!dropdown.contains(e.target) && !button.contains(e.target)) {
        dropdown.classList.add('hidden');
        document.removeEventListener('click', closeDropdownOnClickOutside);
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

// Ensure user email is shown in dropdown
auth.onAuthStateChanged(user => {
    if (user) {
        const emailEl = document.getElementById('dropdown-user-email');
        if (emailEl) emailEl.textContent = user.email;
    }
});
