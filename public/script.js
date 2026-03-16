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
async function fetchUserData() {
    if (!user?.id) return;
    try {
        const response = await fetch(`/api/user/${user.id}`);
        const data = await response.json();
        console.log('User data:', data);
    } catch (err) {
        console.error('Error fetching user data:', err);
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
