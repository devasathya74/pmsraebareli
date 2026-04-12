// Admission Form Firebase Integration
import { admissionHelper, analyticsHelper } from './firebase-config.js';

// Log page view
analyticsHelper.logPageView('admission_form');

// Check if editing existing student
const urlParams = new URLSearchParams(window.location.search);
const editingStudentId = urlParams.get('studentId');
let isEditMode = !!editingStudentId;

let currentStep = 0;
const steps = document.querySelectorAll('.form-step');
const progressSteps = document.querySelectorAll('.progress-step');

function showStep(step) {
    steps.forEach((s, index) => {
        s.classList.toggle('active', index === step);
    });

    progressSteps.forEach((s, index) => {
        if (index < step) {
            s.classList.add('completed');
            s.classList.remove('active');
        } else if (index === step) {
            s.classList.add('active');
            s.classList.remove('completed');
        } else {
            s.classList.remove('active', 'completed');
        }
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function nextStep() {
    if (validateCurrentStep()) {
        if (currentStep < steps.length - 1) {
            currentStep++;
            showStep(currentStep);

            if (currentStep === steps.length - 1) {
                populateReview();
            }
        }
    }
}

function prevStep() {
    if (currentStep > 0) {
        currentStep--;
        showStep(currentStep);
    }
}

function validateCurrentStep() {
    const currentStepElement = steps[currentStep];
    const inputs = currentStepElement.querySelectorAll('input[required], select[required], textarea[required]');

    for (let input of inputs) {
        if (!input.value) {
            input.focus();
            alert('कृपया सभी आवश्यक फ़ील्ड भरें।');
            return false;
        }
    }
    return true;
}

function populateReview() {
    const formData = new FormData(document.getElementById('admission-form'));
    const reviewContent = document.getElementById('review-content');

    let html = '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';

    for (let [key, value] of formData.entries()) {
        if (value && typeof value === 'string') {
            const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

            // Format DOB if key is 'dob'
            let displayValue = value;
            if (key === 'dob' && value.includes('-')) {
                const [year, month, day] = value.split('-');
                displayValue = `${day}/${month}/${year}`;
            }

            html += `
                <div class="border-b pb-2">
                    <p class="text-sm text-gray-500">${label}</p>
                    <p class="font-semibold">${displayValue}</p>
                </div>
            `;
        }
    }

    html += '</div>';
    reviewContent.innerHTML = html;
}

// Form submission with Firebase
document.getElementById('admission-form').addEventListener('submit', async function (e) {
    e.preventDefault();

    if (!document.getElementById('cert2').checked) {
        alert('कृपया नियमों और शर्तों को स्वीकार करें / Please accept the terms and conditions.');
        return;
    }

    const submitButton = document.getElementById('btn_submit');
    const originalText = submitButton.innerText;
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Processing...';

    try {
        // Collect form data
        const formData = new FormData(this);
        const data = {};

        for (let [key, value] of formData.entries()) {
            if (value instanceof File) {
                // Skip files for now, handle separately
                continue;
            }
            data[key] = value;
        }

        // Collect files - only include files that were actually selected
        const files = {};

        const birthCertFile = formData.get('birthCert');
        if (birthCertFile && birthCertFile.size > 0) {
            files.birthCertificate = birthCertFile;
        }

        const aadharCardFile = formData.get('aadharCard');
        if (aadharCardFile && aadharCardFile.size > 0) {
            files.aadharCard = aadharCardFile;
        }

        const casteCertFile = formData.get('casteCert');
        if (casteCertFile && casteCertFile.size > 0) {
            files.casteCertificate = casteCertFile;
        }

        const domicileCertFile = formData.get('domicileCert');
        if (domicileCertFile && domicileCertFile.size > 0) {
            files.domicileCertificate = domicileCertFile;
        }

        const photoFile = formData.get('photo');
        if (photoFile && photoFile.size > 0) {
            files.photo = photoFile;
        }

        console.log('Files to upload:', Object.keys(files)); // Debug log

        // Submit to Firebase
        // Map form data to backend expectations
        const formDataObj = Object.fromEntries(formData.entries());
        const mappedData = {
            student_name: formDataObj.scholarName || '',
            dob: formDataObj.dob || '',
            class: formDataObj.targetClass || '',
            father_name: formDataObj.fatherName || '',
            father_occupation: formDataObj.fatherOcc || '',
            mother_name: formDataObj.motherName || '',
            mother_occupation: formDataObj.motherOcc || '',
            mobile: formDataObj.fMobile || '',
            email: formDataObj.parentEmail || '',
            address: formDataObj.permAddress || '',

            // Other fields to keep as-is or map if needed
            ...formDataObj // Keep original keys too just in case
        };

        // Create a clean object for Firestore data by explicitly excluding File objects
        const cleanData = {};
        for (const [key, value] of Object.entries(mappedData)) {
            // Check if the value is NOT a File object
            if (!(value instanceof File)) {
                cleanData[key] = value;
            }
        }

        let result;

        // Check if editing existing student
        if (isEditMode && editingStudentId) {
            // Update existing student in students collection
            const { firestoreHelper, storageHelper } = await import('./firebase-config.js');

            const studentData = {
                studentName: mappedData.scholarName || '',
                rollNumber: mappedData.rollNumber || '', // Preserve if exists in mappedData (unlikely from form but safe)
                class: mappedData.class || '',
                dob: mappedData.dob || '',
                // gender: mappedData.gender || '', // Gender not in form, don't overwrite with empty if missing
                fatherName: mappedData.fatherName || '',
                fatherOccupation: mappedData.fatherOcc || '',
                fatherCompany: mappedData.fCompany || '',
                fatherPost: mappedData.fPost || '',
                mobile: mappedData.mobile || '',
                email: mappedData.email || '',
                motherName: mappedData.motherName || '',
                motherOccupation: mappedData.motherOcc || '',
                address: mappedData.permAddress || '',
                postalAddress: mappedData.postAddress || '',
                guardianName: mappedData.gName || '',
                guardianAddress: mappedData.gAddress || '',
                guardianRelation: mappedData.gRel || '',
                lastSchool: mappedData.lastInst || '',
                motherTongue: mappedData.tongue || '',
                religion: mappedData.religion || '',
                durationOfStay: mappedData.stayUp || '',
                updatedAt: new Date().toISOString()
            };

            // Handle photo upload if new photo selected
            if (files.photo) {
                const uploadResult = await storageHelper.uploadFile(files.photo, `students/${Date.now()}_${files.photo.name}`);
                if (uploadResult.success) {
                    studentData.photo = uploadResult.url;
                }
            }

            result = await firestoreHelper.updateDocument('students', editingStudentId, studentData);
        } else {
            // Create new admission
            result = await admissionHelper.submitAdmission(cleanData, files);

            // If Admin, immediately approve and create student
            const urlParams = new URLSearchParams(window.location.search);
            if (result.success && urlParams.get('source') === 'admin') {
                console.log('Admin source detected, auto-approving and creating student...');
                try {
                    // Fetch the full admission object we just created to get mapped fields & file URLs
                    const admResult = await firestoreHelper.getDocument('admissions', result.id);
                    if (admResult.success) {
                        const admission = admResult.data;

                        // Construct Student Data (Mirroring createStudentFromAdmission logic)
                        const newStudentData = {
                            studentName: admission.student_name,
                            rollNumber: '', // Manual Assignment
                            admissionId: admission.id, // Ensure this maps to Serial No
                            class: admission.class,
                            dob: admission.dob,
                            gender: admission.gender || '',
                            fatherName: admission.father_name,
                            fatherOccupation: admission.father_occupation || '',
                            fatherCompany: admission.father_company || '',
                            fatherPost: admission.father_post || '',
                            motherName: admission.mother_name,
                            motherOccupation: admission.mother_occupation || '',
                            mobile: admission.mobile,
                            email: admission.email,
                            address: admission.address,
                            postalAddress: admission.postal_address || '',
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

                            admissionId: admission.id,
                            status: 'active',
                            createdAt: new Date().toISOString()
                        };

                        // Create Student
                        await firestoreHelper.addDocument('students', newStudentData);

                        // Update Admission Status
                        await firestoreHelper.updateDocument('admissions', result.id, { status: 'approved' });
                        console.log('Auto-approval complete.');
                    }
                } catch (autoApproveError) {
                    console.error('Auto-approval failed:', autoApproveError);
                    // Don't fail the whole submission, just log it. The admission is still saved as pending.
                }
            }

        }

        if (result.success) {
            // Log analytics event
            analyticsHelper.logEvent(isEditMode ? 'student_updated' : 'admission_submitted', {
                class: mappedData.class,
                has_documents: !!(files.birthCertificate || files.aadharCard || files.photo)
            });

            // Show success message
            if (isEditMode) {
                alert(`छात्र की जानकारी सफलतापूर्वक अपडेट हो गई है!`);
            } else {
                alert(`आपका आवेदन सफलतापूर्वक सबमिट हो गया है!\n\nआवेदन संख्या: ${result.id}\n\nहम जल्द ही आपसे संपर्क करेंगे।`);
            }

            // Clear form
            this.reset();

            // Check if opened from admin dashboard
            const urlParams = new URLSearchParams(window.location.search);
            const source = urlParams.get('source');

            // Redirect based on source
            if (source === 'admin') {
                // Immediate redirect for admin
                window.location.href = 'admin-dashboard.html?tab=students';
            } else {
                // Delay for public users to see success message
                setTimeout(() => {
                    window.location.href = '../index.html';
                }, 2000);
            }
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('Submission error:', error);
        alert('Submission Error: ' + error.message + '\n\nPlease try again.');

        // Re-enable button
        const submitButton = document.getElementById('btn_submit');
        submitButton.disabled = false;
        submitButton.innerHTML = '<span id="btn_submit_text">Final Submit Application</span>';
    }
});

// Make functions available globally
window.nextStep = nextStep;
window.prevStep = prevStep;

// Load existing student data if in edit mode
async function loadStudentData() {
    if (!isEditMode || !editingStudentId) return;

    console.log('Loading student data for ID:', editingStudentId);

    try {
        const { firestoreHelper } = await import('./firebase-config.js');
        const result = await firestoreHelper.getDocument('students', editingStudentId);

        if (result.success && result.data) {
            const s = result.data;
            console.log('Student data retrieved:', s);

            // Helper function to set field value by name attribute
            const setFieldValue = (name, value) => {
                const field = document.querySelector(`[name="${name}"]`);
                if (field && value !== undefined && value !== null) {
                    field.value = value;
                    console.log(`Set ${name} = ${value}`);
                } else if (!field) {
                    console.warn(`Field not found: ${name}`);
                }
            };

            // Populate all fields using name attributes
            // Populate all fields using name attributes
            setFieldValue('scholarName', s.studentName);
            setFieldValue('dob', s.dob);
            setFieldValue('targetClass', s.class);

            // Parent Details
            setFieldValue('fatherName', s.fatherName);
            setFieldValue('fatherOcc', s.fatherOccupation);
            setFieldValue('fCompany', s.fatherCompany);
            setFieldValue('fPost', s.fatherPost);
            setFieldValue('fMobile', s.mobile);
            setFieldValue('parentEmail', s.email);
            setFieldValue('motherName', s.motherName);
            setFieldValue('motherOcc', s.motherOccupation);

            // Address Details
            setFieldValue('permAddress', s.address);
            setFieldValue('postAddress', s.postalAddress);

            // Guardian Details
            setFieldValue('gName', s.guardianName);
            setFieldValue('gAddress', s.guardianAddress);
            setFieldValue('gRel', s.guardianRelation);

            // Other Details
            setFieldValue('lastInst', s.lastSchool);
            setFieldValue('tongue', s.motherTongue);
            setFieldValue('religion', s.religion);
            setFieldValue('stayUp', s.durationOfStay);

            // Trigger change events for validation/formatting if needed
            // handleLastInstChange(); // If necessary

            // VERIFICATION: Check if critical fields loaded
            const criticalFields = ['scholarName', 'dob', 'fatherName', 'motherName', 'tongue', 'religion', 'stayUp'];
            const missingFields = criticalFields.filter(field => {
                const el = document.querySelector(`[name="${field}"]`);
                return el && !el.value;
            });

            if (missingFields.length > 0) {
                console.warn('⚠️ Some fields might not have auto-filled correctly or are empty in DB:', missingFields);
            } else {
                console.log('✅ All critical fields loaded successfully.');
            }




            // Helper to set document preview
            const setDocPreview = (url, previewId, imageId) => {
                if (!url) return;

                const previewEl = document.getElementById(previewId);
                const imageEl = document.getElementById(imageId);

                if (previewEl) {
                    previewEl.innerHTML = `<a href="${url}" target="_blank" class="text-blue-600 hover:underline"><i class="fas fa-external-link-alt mr-1"></i>View Uploaded Document</a>`;
                }

                if (imageEl) {
                    // Check if likely an image based on extension or assume image since mapped
                    imageEl.innerHTML = `<img src="${url}" class="h-24 w-auto object-cover border rounded mt-2" alt="Document Preview">`;
                }
            };

            // Set Documents
            if (s.birthCertificate) setDocPreview(s.birthCertificate, 'birthCertPreview', 'birthCertImage');
            if (s.aadharCard) setDocPreview(s.aadharCard, 'aadharCardPreview', 'aadharCardImage');
            if (s.casteCert) setDocPreview(s.casteCert, 'casteCertPreview', 'casteCertImage');
            if (s.domicileCert) setDocPreview(s.domicileCert, 'domicileCertPreview', 'domicileCertImage');

            // Set photo if available
            if (s.photo) {
                // The photo preview container in admission.html is instantPhotoPreview
                const photoContainer = document.getElementById('instantPhotoPreview');
                const photoInput = document.getElementById('studentPhotoInput');

                if (photoContainer) {
                    // Clear existing content and add image
                    photoContainer.innerHTML = '';
                    const img = document.createElement('img');
                    img.src = s.photo;
                    img.className = 'w-full h-full object-cover rounded';
                    img.alt = 'Student Photo';
                    photoContainer.appendChild(img);

                    // Add a small text indicating existing photo
                    const label = document.createElement('span');
                    label.className = 'absolute bottom-0 bg-black bg-opacity-50 text-white text-[10px] w-full text-center py-1';
                    label.innerText = 'Current Photo';
                    photoContainer.style.position = 'relative';
                    photoContainer.appendChild(label);

                    console.log('✅ Photo loaded:', s.photo);
                } else {
                    console.warn('Photo preview container (instantPhotoPreview) not found');
                }
            }

            console.log('✅ Student data loaded successfully');
        } else {
            console.error('Failed to load student:', result.error);
        }
    } catch (error) {
        console.error('Error loading student data:', error);
    }
}

// Wait for window to be fully loaded before loading data
if (isEditMode) {
    console.log('Edit mode detected, will load student data');

    // Use window load event to ensure all scripts and DOM are ready
    window.addEventListener('load', () => {
        console.log('Window fully loaded, loading student data now');
        loadStudentData();
    });
}

