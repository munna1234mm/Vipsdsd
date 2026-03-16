const tg = window.Telegram.WebApp;
const usernameEl = document.getElementById('username');
const userIdEl = document.getElementById('user-id');
const profilePicEl = document.getElementById('profile-pic');
const redeemBtn = document.getElementById('redeem-btn');
const redeemCodeInput = document.getElementById('redeem-code');
const redeemStatus = document.getElementById('redeem-status');

tg.expand();

const user = tg.initDataUnsafe?.user;
if (user) {
    usernameEl.textContent = `@${user.username || user.first_name}`;
    userIdEl.textContent = `ID: ${user.id}`;
    
    // Fetch profile photo from backend
    fetch(`/api/user-photo/${user.id}`)
        .then(res => res.json())
        .then(data => {
            if (data.photoUrl) {
                profilePicEl.src = data.photoUrl;
            }
        })
        .catch(err => console.error('Error fetching photo:', err));
} else {
    usernameEl.textContent = 'Guest User';
}

// Fetch user data from our API
async function fetchUserData(isPolling = false) {
    if (!user?.id) {
        if (!isPolling) updateStatusUI({ subscription_type: 'Free' });
        return;
    }
    try {
        const response = await fetch(`/api/user/${user.id}`);
        const userData = await response.json();
        
        if (userData && !userData.error) {
            updateStatusUI(userData);
        } else {
            // User not found in DB, default to Free
            if (!isPolling) updateStatusUI({ subscription_type: 'Free' });
        }
    } catch (err) {
        console.error('Error fetching user data:', err);
        if (!isPolling) updateStatusUI({ subscription_type: 'Free' });
    }
}

// Initial fetch
fetchUserData();

// Real-time Update using Firebase Listeners
function setupRealtimeListener() {
    if (!user?.id) return;
    
    // Check if Firebase is ready every 500ms until it is
    if(!window.firebaseDb) {
        setTimeout(setupRealtimeListener, 500);
        return;
    }
    
    console.log('Firebase Listener Active for:', user.id);
    window.onFirestoreSnapshot(window.firestoreDoc(window.firebaseDb, "users", String(user.id)), (doc) => {
        if (doc.exists()) {
            const data = doc.data();
            console.log('Firebase Sync:', data);
            updateStatusUI(data);
        } else {
            console.log('Firebase document not found, syncing from SQL...');
            fetchUserData(); // Fallback to SQL if Firebase is empty
        }
    });
}

setupRealtimeListener();

function updateStatusUI(userData) {
    console.log('Updating UI with:', userData);
    const planStatus = document.getElementById('plan-status');
    const expiryStatus = document.getElementById('expiry-status');

    if (!userData) return;

    const currentPlan = userData.subscription_type || 'Free';
    planStatus.textContent = `${currentPlan} Plan`;
    
    // Highlight active card
    document.querySelectorAll('.plan-card').forEach(card => {
        card.classList.remove('active');
        const badge = card.querySelector('.active-plan-badge');
        if (badge) badge.remove();

        if (card.dataset.plan === currentPlan && currentPlan !== 'Free') {
            card.classList.add('active');
            const activeBadge = document.createElement('span');
            activeBadge.className = 'active-plan-badge';
            activeBadge.textContent = 'Active Now';
            card.querySelector('.plan-header').appendChild(activeBadge);
        }
    });

    // Change status text color
    if (currentPlan === 'Free') {
        planStatus.style.color = 'var(--text-muted)';
    } else {
        planStatus.style.color = 'var(--success)';
    }
    
    if (userData.subscription_expiry) {
        const date = new Date(userData.subscription_expiry);
        expiryStatus.textContent = `Valid until ${date.toLocaleDateString()}`;
    } else {
        expiryStatus.textContent = 'Never expires';
    }
}

fetchUserData();

redeemBtn.addEventListener('click', async () => {
    const code = redeemCodeInput.value.trim();
    if (!code) return;

    redeemBtn.disabled = true;
    redeemStatus.textContent = 'Applying...';
    redeemStatus.className = '';

    try {
        const response = await fetch('/api/redeem', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId: user?.id, code })
        });
        const data = await response.json();

        if (response.ok) {
            redeemStatus.textContent = data.message;
            redeemStatus.className = 'success';
            redeemCodeInput.value = '';
            if (data.user) updateStatusUI(data.user);
        } else {
            redeemStatus.textContent = data.error;
            redeemStatus.className = 'error';
        }
    } catch (err) {
        redeemStatus.textContent = 'Something went wrong.';
        redeemStatus.className = 'error';
    } finally {
        redeemBtn.disabled = false;
    }
});

// Handle Buy buttons (Link to Admin)
document.querySelectorAll('.buy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const plan = btn.parentElement.dataset.plan;
        tg.openTelegramLink('https://t.me/developermunna');
    });
});
