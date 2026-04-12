import os

filepath = r"c:\Users\HP\Documents\New project\school_app\static\assets\js\admin-dashboard.js"
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update Imports
old_import = "import { authHelper, firestoreHelper, analyticsHelper, storageHelper, collection, query, where, getDocs, orderBy, limit, addDoc, db, auth, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from './firebase-config.js';"
new_import = "import { authHelper, firestoreHelper, analyticsHelper, storageHelper, collection, query, where, getDocs, orderBy, limit, addDoc, db, auth, updatePassword, reauthenticateWithCredential, EmailAuthProvider, onAuthStateChanged } from './firebase-config.js';"
content = content.replace(old_import, new_import)

# 2. Update Auth Listener logic
old_auth = """    authHelper.onAuthChange(async (user) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }"""

new_auth = """    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            // Centralized logout handles redirect
            return;
        }"""

# Try both CRLF and LF matches just in case
content = content.replace(old_auth.replace('\n', '\r\n'), new_auth.replace('\n', '\r\n'))
content = content.replace(old_auth, new_auth)

# 3. Update Dropdown logic
old_dropdown = """window.toggleUserDropdown = function () {
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
}"""

new_dropdown = """window.toggleUserDropdown = function (e) {
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
}"""

content = content.replace(old_dropdown.replace('\n', '\r\n'), new_dropdown.replace('\n', '\r\n'))
content = content.replace(old_dropdown, new_dropdown)

# 4. Remove redundant listener
old_redundant = """// Ensure user email is shown in dropdown
auth.onAuthStateChanged(user => {
    if (user) {
        const emailEl = document.getElementById('dropdown-user-email');
        if (emailEl) emailEl.textContent = user.email;
    }
});"""

new_redundant = """// Setup email in dropdown if already present
if (auth.currentUser) {
    const emailEl = document.getElementById('dropdown-user-email');
    if (emailEl) emailEl.textContent = auth.currentUser.email;
}"""

content = content.replace(old_redundant.replace('\n', '\r\n'), new_redundant.replace('\n', '\r\n'))
content = content.replace(old_redundant, new_redundant)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Applied changes to admin-dashboard.js")
