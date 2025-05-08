const socket = io();
let currentLanguage = 'ua';
const tg = window.Telegram.WebApp;

const translations = {
    ua: {
        submitFeedback: 'Надіслати звернення',
        feedbackType: 'Тип звернення',
        complaint: 'Скарга',
        suggestion: 'Пропозиція',
        message: 'Повідомлення',
        contactInfo: 'Контактна інформація',
        submit: 'Надіслати',
        feedbackList: 'Список звернень',
        status: 'Статус',
        new: 'Нове',
        answered: 'Відповідь надано',
        date: 'Дата',
        noFeedback: 'Немає звернень',
        adminResponse: 'Відповідь адміністратора',
        responseDate: 'Дата відповіді'
    },
    en: {
        submitFeedback: 'Submit Feedback',
        feedbackType: 'Feedback Type',
        complaint: 'Complaint',
        suggestion: 'Suggestion',
        message: 'Message',
        contactInfo: 'Contact Information',
        submit: 'Submit',
        feedbackList: 'Feedback List',
        status: 'Status',
        new: 'New',
        answered: 'Answered',
        date: 'Date',
        noFeedback: 'No feedback available',
        adminResponse: 'Admin Response',
        responseDate: 'Response Date'
    }
};

// Initialize Telegram WebApp
tg.expand();
tg.ready();

// Auto-login using Telegram data
async function initializeUser() {
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: tg.initDataUnsafe.user.id.toString(),
                username: tg.initDataUnsafe.user.username,
                isTelegram: true
            })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.role === 'admin') {
                document.body.classList.add('admin-mode');
            }
            updateFeedbackList();
        }
    } catch (error) {
        console.error('Login error:', error);
    }
}

function setLanguage(lang) {
    currentLanguage = lang;
    document.querySelectorAll('[data-translate]').forEach(element => {
        const key = element.getAttribute('data-translate');
        if (translations[lang][key]) {
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                element.placeholder = translations[lang][key];
            } else {
                element.textContent = translations[lang][key];
            }
        }
    });
    updateFeedbackList();
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleString(currentLanguage === 'ua' ? 'uk-UA' : 'en-US');
}

function renderComplaint(complaint) {
    return `
        <div class="feedback-item ${complaint.type.toLowerCase()}">
            <h6>
                ${translations[currentLanguage][complaint.type.toLowerCase()]}
                <span class="status ${complaint.status}">${translations[currentLanguage][complaint.status]}</span>
            </h6>
            <div class="feedback-message">${complaint.message}</div>
            ${complaint.adminResponse ? `
                <div class="admin-response">
                    <strong>${translations[currentLanguage].adminResponse}:</strong>
                    <p>${complaint.adminResponse.text}</p>
                    <small>${translations[currentLanguage].responseDate}: ${formatDate(complaint.adminResponse.date)}</small>
                </div>
            ` : ''}
            <div class="feedback-meta">
                ${translations[currentLanguage].date}: ${formatDate(complaint.date)}
                ${complaint.contactInfo ? `| ${translations[currentLanguage].contactInfo}: ${complaint.contactInfo}` : ''}
            </div>
        </div>
    `;
}

async function updateFeedbackList() {
    try {
        const response = await fetch('/api/complaints');
        if (response.ok) {
            const complaints = await response.json();
            const feedbackList = document.getElementById('feedbackList');
            
            if (complaints.length === 0) {
                feedbackList.innerHTML = `<p class="text-muted">${translations[currentLanguage].noFeedback}</p>`;
                return;
            }

            feedbackList.innerHTML = complaints.map(renderComplaint).join('');
        }
    } catch (error) {
        console.error('Error fetching feedback:', error);
    }
}

document.getElementById('feedbackForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = {
        type: document.getElementById('type').value,
        message: document.getElementById('message').value,
        contactInfo: tg.initDataUnsafe.user.username || tg.initDataUnsafe.user.first_name
    };

    try {
        const response = await fetch('/api/complaints', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        if (response.ok) {
            document.getElementById('feedbackForm').reset();
            updateFeedbackList();
            tg.showAlert(
                currentLanguage === 'ua' 
                    ? 'Звернення успішно надіслано!' 
                    : 'Feedback submitted successfully!'
            );
        } else {
            tg.showAlert(
                currentLanguage === 'ua' 
                    ? 'Помилка при надсиланні звернення' 
                    : 'Error submitting feedback'
            );
        }
    } catch (error) {
        console.error('Error:', error);
        tg.showAlert(
            currentLanguage === 'ua' 
                ? 'Помилка при надсиланні звернення' 
                : 'Error submitting feedback'
        );
    }
});

socket.on('newComplaint', () => {
    updateFeedbackList();
});

socket.on('complaintUpdated', () => {
    updateFeedbackList();
});

// Initialize the app
initializeUser();
setLanguage('ua');