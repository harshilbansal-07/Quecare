const form = document.getElementById('login-form');
const msg = document.getElementById('msg');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  msg.className = 'msg';
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: document.getElementById('email').value,
        password: document.getElementById('password').value,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Login failed');
    window.location.href = data.role === 'receptionist' ? '/reception/' : '/doctor/';
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'msg error show';
    msg.setAttribute('role', 'alert');
  }
});
