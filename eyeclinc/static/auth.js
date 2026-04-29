/**
 * auth.js  —  Noor Optical Clinic SaaS v3
 * ─────────────────────────────────────────
 * Drop this file in /static/.
 * Add  <script src="/static/auth.js"></script>  as the FIRST script in <head>.
 *
 * What it does:
 *  1. On page load → calls /api/auth/me
 *  2. If not authenticated → shows login screen (hides #app)
 *  3. After login → stores token, sets role + clinic_name globally
 *  4. Patches fetch() to auto-send X-Session-Token header
 *  5. Role-gates sidebar buttons and pages
 *  6. Adds User Management page (admin only)
 *  7. Handles license expiry banners
 *  8. NEW: Signup panel — new clinic self-registers, gets 7-day trial
 *  9. NEW: clinic_name loaded from server and applied everywhere
 */

// ══════════════════════════════════════════════════════════════════
// GLOBAL AUTH STATE
// ══════════════════════════════════════════════════════════════════
window.AUTH = {
  token:       sessionStorage.getItem('noor_token') || '',
  role:        '',
  full_name:   '',
  username:    '',
  clinic_id:   1,
  clinic_name: '',
  license:     null,
};

// ══════════════════════════════════════════════════════════════════
// ROLE PERMISSION MAP
// ══════════════════════════════════════════════════════════════════
const ROLE_PAGES = {
  admin:        ['entry','followup','dashboard','ledger','debtors','reports','lenses','settings','users'],
  doctor:       ['entry','followup','dashboard','ledger','reports','lenses'],
  receptionist: ['entry','followup','dashboard','ledger'],
};

const ROLE_LABEL = {
  admin:        '🔑 مدير',
  doctor:       '👨‍⚕️ طبيب',
  receptionist: '💼 موظف استقبال',
};

// ══════════════════════════════════════════════════════════════════
// PATCH fetch() — auto-inject session token header
// ══════════════════════════════════════════════════════════════════
(function patchFetch() {
  const _orig = window.fetch.bind(window);
  window.fetch = function(input, init = {}) {
    init.headers = init.headers || {};
    if (AUTH.token) {
      init.headers['X-Session-Token'] = AUTH.token;
    }
    return _orig(input, init).then(resp => {
      if (resp.status === 401) {
        // Session expired — force re-login
        AUTH.token = '';
        sessionStorage.removeItem('noor_token');
        showLoginScreen('انتهت جلسة العمل، يرجى تسجيل الدخول مجدداً');
      }
      return resp;
    });
  };
})();

// ══════════════════════════════════════════════════════════════════
// LOGIN SCREEN HTML
// ══════════════════════════════════════════════════════════════════
function _buildLoginScreen() {
  const el = document.createElement('div');
  el.id = 'login-screen';
  el.innerHTML = `
<style>
#login-screen {
  position:fixed;inset:0;z-index:99999;
  background:var(--acc, #1e3a5f);
  display:flex;align-items:center;justify-content:center;
  padding:20px;font-family:var(--font,'IBM Plex Sans Arabic',sans-serif);
  direction:rtl;
}
#login-screen.hiding{opacity:0;transition:opacity .3s ease;pointer-events:none;}
.ls-card{
  background:#fff;border-radius:20px;padding:36px 32px;
  width:100%;max-width:400px;
  box-shadow:0 24px 80px rgba(0,0,0,.25);
  text-align:center;
}
.ls-logo{
  width:64px;height:64px;border-radius:16px;
  background:var(--acc,#1e3a5f);
  display:flex;align-items:center;justify-content:center;
  margin:0 auto 16px;
  box-shadow:0 4px 16px rgba(30,58,95,.3);
}
.ls-logo svg{width:30px;height:30px;fill:white;}
.ls-title{font-size:20px;font-weight:800;color:#1c1f26;margin-bottom:4px;letter-spacing:-.3px;}
.ls-sub{font-size:13.5px;color:#8a90a0;margin-bottom:28px;}
.ls-field{margin-bottom:14px;text-align:right;}
.ls-field label{display:block;font-size:11px;font-weight:700;color:#4a5060;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;}
.ls-field input{
  width:100%;padding:11px 14px;border:1.5px solid #e4e6ea;border-radius:10px;
  font-size:15px;font-family:inherit;color:#1c1f26;background:#fafbfc;
  outline:none;transition:border-color .15s,box-shadow .15s;box-sizing:border-box;
  direction:ltr;text-align:left;
}
.ls-field input[data-arabic]{direction:rtl;text-align:right;}
.ls-field input:focus{border-color:var(--acc,#1e3a5f);box-shadow:0 0 0 3px rgba(30,58,95,.1);}
.ls-btn{
  width:100%;padding:13px;border:none;border-radius:10px;
  background:var(--acc,#1e3a5f);color:white;
  font-size:15px;font-weight:700;font-family:inherit;
  cursor:pointer;transition:background .15s,transform .1s;
  margin-top:4px;
}
.ls-btn:hover{background:#2952a3;}
.ls-btn:active{transform:scale(.98);}
.ls-btn:disabled{opacity:.5;cursor:not-allowed;transform:none;}
.ls-btn-ghost{
  width:100%;padding:11px;border:1.5px solid #e4e6ea;border-radius:10px;
  background:transparent;color:#4a5060;
  font-size:14px;font-weight:600;font-family:inherit;
  cursor:pointer;transition:all .15s;margin-top:8px;
}
.ls-btn-ghost:hover{border-color:#aab;color:#1c1f26;}
.ls-error{
  background:#fff5f5;border:1px solid #fecaca;border-radius:8px;
  color:#7f1d1d;font-size:13px;font-weight:600;
  padding:10px 14px;margin-bottom:14px;display:none;text-align:center;
}
.ls-error.show{display:block;}
.ls-success{
  background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;
  color:#14532d;font-size:13px;font-weight:600;
  padding:10px 14px;margin-bottom:14px;display:none;text-align:center;
}
.ls-success.show{display:block;}
.ls-footer{font-size:11.5px;color:#b0b6c4;margin-top:20px;}
.ls-divider{display:flex;align-items:center;gap:10px;margin:18px 0;color:#c0c6d4;font-size:12px;}
.ls-divider::before,.ls-divider::after{content:'';flex:1;height:1px;background:#e4e6ea;}
.ls-trial-badge{
  display:inline-block;padding:4px 12px;border-radius:8px;
  background:rgba(34,197,94,.1);color:#15803d;
  font-size:12px;font-weight:700;margin-bottom:20px;
  border:1px solid rgba(34,197,94,.2);
}
/* Panel toggle */
#ls-panel-login,#ls-panel-signup{transition:none;}
</style>

<div class="ls-card">
  <div class="ls-logo">
    <svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
  </div>
  <div class="ls-title" id="ls-clinic-name">نظام إدارة العيادة</div>
  <div class="ls-sub" id="ls-sub-text">سجّل دخولك للمتابعة</div>

  <!-- ── LOGIN PANEL ── -->
  <div id="ls-panel-login">
    <div class="ls-error" id="ls-error"></div>
    <div class="ls-field">
      <label>اسم المستخدم</label>
      <input id="ls-username" type="text" placeholder="admin" autocomplete="username" autocapitalize="none">
    </div>
    <div class="ls-field">
      <label>كلمة المرور</label>
      <input id="ls-password" type="password" placeholder="••••••••" autocomplete="current-password">
    </div>
    <button class="ls-btn" id="ls-submit" onclick="doLogin()">تسجيل الدخول</button>
    <div class="ls-divider">أو</div>
    <button class="ls-btn-ghost" onclick="_showSignupPanel()">إنشاء حساب عيادة جديدة — تجربة مجانية 7 أيام</button>
  </div>

  <!-- ── SIGNUP PANEL ── -->
  <div id="ls-panel-signup" style="display:none">
    <div class="ls-trial-badge">✨ تجربة مجانية 7 أيام — بدون بطاقة ائتمانية</div>
    <div class="ls-error" id="ls-su-error"></div>
    <div class="ls-success" id="ls-su-success"></div>
    <div class="ls-field">
      <label>اسم العيادة</label>
      <input id="su-clinic" type="text" placeholder="مثال: عيادة الأمل البصرية" data-arabic autocomplete="organization">
    </div>
    <div class="ls-field">
      <label>اسم المستخدم (للدخول)</label>
      <input id="su-username" type="text" placeholder="مثال: dr.ahmed" autocomplete="username" autocapitalize="none">
    </div>
    <div class="ls-field">
      <label>كلمة المرور</label>
      <input id="su-password" type="password" placeholder="6 أحرف على الأقل" autocomplete="new-password">
    </div>
    <div class="ls-field">
      <label>رقم الهاتف (اختياري — للتواصل)</label>
      <input id="su-phone" type="tel" placeholder="07xxxxxxxxx">
    </div>
    <button class="ls-btn" id="su-submit" onclick="doSignup()">إنشاء الحساب والبدء مجاناً →</button>
    <button class="ls-btn-ghost" onclick="_showLoginPanel()">→ العودة لتسجيل الدخول</button>
  </div>

  <div class="ls-footer" id="ls-footer-text">نظام إدارة العيادة البصرية</div>
</div>`;
  document.body.appendChild(el);
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      if (document.getElementById('ls-panel-signup').style.display === 'none') doLogin();
      else doSignup();
    }
  });
}

function _showSignupPanel() {
  document.getElementById('ls-panel-login').style.display = 'none';
  document.getElementById('ls-panel-signup').style.display = '';
  document.getElementById('ls-sub-text').textContent = 'أنشئ حساب عيادتك الآن';
  setTimeout(() => document.getElementById('su-clinic')?.focus(), 80);
}

function _showLoginPanel() {
  document.getElementById('ls-panel-signup').style.display = 'none';
  document.getElementById('ls-panel-login').style.display = '';
  document.getElementById('ls-sub-text').textContent = 'سجّل دخولك للمتابعة';
  setTimeout(() => document.getElementById('ls-username')?.focus(), 80);
}

function showLoginScreen(errMsg = '') {
  document.getElementById('app').style.display = 'none';
  let ls = document.getElementById('login-screen');
  if (!ls) { _buildLoginScreen(); ls = document.getElementById('login-screen'); }
  ls.style.display = 'flex';
  ls.classList.remove('hiding');
  if (errMsg) {
    const errEl = document.getElementById('ls-error');
    if (errEl) { errEl.textContent = errMsg; errEl.classList.add('show'); }
  }
  setTimeout(() => document.getElementById('ls-username')?.focus(), 100);
}

function hideLoginScreen() {
  const ls = document.getElementById('login-screen');
  if (!ls) return;
  ls.classList.add('hiding');
  setTimeout(() => { ls.style.display = 'none'; ls.classList.remove('hiding'); }, 320);
  document.getElementById('app').style.display = '';
}

// ══════════════════════════════════════════════════════════════════
// LOGIN / LOGOUT
// ══════════════════════════════════════════════════════════════════
async function doLogin() {
  const username = document.getElementById('ls-username')?.value.trim();
  const password = document.getElementById('ls-password')?.value;
  const errEl    = document.getElementById('ls-error');
  const btn      = document.getElementById('ls-submit');

  if (!username || !password) {
    if (errEl) { errEl.textContent = 'أدخل اسم المستخدم وكلمة المرور'; errEl.classList.add('show'); }
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ جارٍ تسجيل الدخول...';
  if (errEl) errEl.classList.remove('show');

  try {
    const resp = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await resp.json();

    if (!resp.ok) {
      if (errEl) { errEl.textContent = data.error || 'خطأ في تسجيل الدخول'; errEl.classList.add('show'); }
      btn.disabled = false;
      btn.textContent = 'تسجيل الدخول';
      return;
    }

    // Success — store auth state
    AUTH.token       = data.token;
    AUTH.role        = data.role;
    AUTH.full_name   = data.full_name;
    AUTH.username    = data.username;
    AUTH.clinic_id   = data.clinic_id;
    AUTH.clinic_name = data.clinic_name || '';
    AUTH.license     = data.license;

    sessionStorage.setItem('noor_token', data.token);
    sessionStorage.setItem('noor_role', data.role);

    hideLoginScreen();
    _applyClinicName(data.clinic_name);
    applyRoleGating();
    showLicenseBanner(data.license);
    updateUserBadge();

    // Re-run app init now that we're authenticated
    if (typeof init === 'function') init();

  } catch(e) {
    if (errEl) { errEl.textContent = 'خطأ في الاتصال بالخادم'; errEl.classList.add('show'); }
    btn.disabled = false;
    btn.textContent = 'تسجيل الدخول';
  }
}

// ══════════════════════════════════════════════════════════════════
// SIGNUP
// ══════════════════════════════════════════════════════════════════
async function doSignup() {
  const clinic_name = document.getElementById('su-clinic')?.value.trim();
  const username    = document.getElementById('su-username')?.value.trim();
  const password    = document.getElementById('su-password')?.value;
  const phone       = document.getElementById('su-phone')?.value.trim();
  const errEl       = document.getElementById('ls-su-error');
  const sucEl       = document.getElementById('ls-su-success');
  const btn         = document.getElementById('su-submit');

  const showErr = msg => { if(errEl){errEl.textContent=msg;errEl.classList.add('show');} };
  const hideErr = ()  => { if(errEl) errEl.classList.remove('show'); };
  if(sucEl) sucEl.classList.remove('show');
  hideErr();

  if (!clinic_name) { showErr('أدخل اسم العيادة'); return; }
  if (!username || username.length < 3) { showErr('اسم المستخدم يجب أن يكون 3 أحرف على الأقل'); return; }
  if (!/^[a-z0-9_.]+$/.test(username)) { showErr('اسم المستخدم: أحرف إنجليزية صغيرة وأرقام فقط'); return; }
  if (!password || password.length < 6) { showErr('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return; }

  btn.disabled = true;
  btn.textContent = '⏳ جارٍ إنشاء الحساب...';

  try {
    const resp = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clinic_name, username, password, phone }),
    });
    const data = await resp.json();

    if (!resp.ok) {
      showErr(data.error || 'حدث خطأ، حاول مرة أخرى');
      btn.disabled = false;
      btn.textContent = 'إنشاء الحساب والبدء مجاناً →';
      return;
    }

    // Success — auto-login with returned token
    AUTH.token       = data.token;
    AUTH.role        = data.role;
    AUTH.clinic_id   = data.clinic_id;
    AUTH.clinic_name = data.clinic_name;
    AUTH.username    = data.username;
    AUTH.license     = { ok: true, days_left: 7, plan: 'trial', message: 'تجربة مجانية — 7 أيام' };

    sessionStorage.setItem('noor_token', data.token);
    sessionStorage.setItem('noor_role', data.role);

    // Show brief success before entering app
    if(sucEl){ sucEl.textContent = `🎉 مرحباً! تم إنشاء حساب "${data.clinic_name}" — جارٍ الدخول...`; sucEl.classList.add('show'); }

    setTimeout(() => {
      hideLoginScreen();
      _applyClinicName(data.clinic_name);
      applyRoleGating();
      showLicenseBanner(AUTH.license);
      updateUserBadge();
      if (typeof init === 'function') init();
    }, 1200);

  } catch(e) {
    showErr('خطأ في الاتصال بالخادم');
    btn.disabled = false;
    btn.textContent = 'إنشاء الحساب والبدء مجاناً →';
  }
}

async function doLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch(e) {}
  AUTH.token = '';
  AUTH.role  = '';
  sessionStorage.removeItem('noor_token');
  sessionStorage.removeItem('noor_role');
  // Clear the app state by reloading
  location.reload();
}

// ══════════════════════════════════════════════════════════════════
// CLINIC NAME — apply to all .clinic-name spans + title + login screen
// ══════════════════════════════════════════════════════════════════
function _applyClinicName(name) {
  if (!name) return;
  AUTH.clinic_name = name;
  // Page title
  document.title = name;
  // All .clinic-name spans in the app
  document.querySelectorAll('.clinic-name').forEach(el => { el.textContent = name; });
  // Sidebar clinic name div
  const sb = document.getElementById('sb-clinic-name');
  if (sb) sb.textContent = name;
  // Login screen title (visible if user goes back to login)
  const lsTitle = document.getElementById('ls-clinic-name');
  if (lsTitle) lsTitle.textContent = name;
  // Login screen footer
  const lsFooter = document.getElementById('ls-footer-text');
  if (lsFooter) lsFooter.textContent = name;
  // SETS object used by index.html charts/reports
  if (window.SETS) window.SETS.clinic_name = name;
}

// ══════════════════════════════════════════════════════════════════
// ROLE GATING  — hide sidebar items and topbar buttons
// ══════════════════════════════════════════════════════════════════
function applyRoleGating() {
  const role    = AUTH.role;
  const allowed = ROLE_PAGES[role] || [];

  // ── Sidebar buttons ──────────────────────────────────────────
  // Map page id → selector fragment in onclick attribute
  const pageMap = {
    entry:       "showPage('entry'",
    followup:    "showPage('followup'",
    dashboard:   "showPage('dashboard'",
    ledger:      "showPage('ledger'",
    debtors:     "showPage('debtors'",
    reports:     "showPage('reports'",
    lenses:      "showPage('lenses'",
    settings:    "showPage('settings'",
    users:       "showPage('users'",
  };

  document.querySelectorAll('.sb-btn').forEach(btn => {
    const onclick = btn.getAttribute('onclick') || '';
    for (const [page, fragment] of Object.entries(pageMap)) {
      if (onclick.includes(fragment)) {
        btn.style.display = allowed.includes(page) ? '' : 'none';
        break;
      }
    }
  });

  // ── Bottom tab bar (mobile) ──────────────────────────────────
  document.querySelectorAll('.tab-btn,[class*="tab-more-item"]').forEach(btn => {
    const onclick = btn.getAttribute('onclick') || '';
    for (const [page, fragment] of Object.entries(pageMap)) {
      if (onclick.includes(fragment)) {
        btn.style.display = allowed.includes(page) ? '' : 'none';
        break;
      }
    }
  });

  // ── Topbar buttons — hide financial actions for receptionist ─
  if (role === 'receptionist') {
    document.getElementById('topbar-backup-btn')?.style && (document.getElementById('topbar-backup-btn').style.display = 'none');
    // Excel export
    document.querySelectorAll('[onclick*="export/excel"]').forEach(el => el.style.display = 'none');
  }

  // ── Add Users page to sidebar if admin ──────────────────────
  if (role === 'admin') {
    _injectUsersSidebarBtn();
    _injectUsersPage();
  }

  // ── Add Users item to "more" tab panel ──────────────────────
  if (role === 'admin') {
    _injectUsersTabMore();
  }
}

// ══════════════════════════════════════════════════════════════════
// USER BADGE in topbar
// ══════════════════════════════════════════════════════════════════
function updateUserBadge() {
  // Remove existing badge if any
  document.getElementById('auth-user-badge')?.remove();

  const badge = document.createElement('div');
  badge.id    = 'auth-user-badge';
  badge.style.cssText = `
    display:flex;align-items:center;gap:8px;
    padding:5px 12px;border-radius:8px;
    background:var(--acc-s);border:1px solid var(--acc-m);
    font-size:12px;font-weight:700;color:var(--acc);
    cursor:pointer;user-select:none;white-space:nowrap;
  `;
  badge.innerHTML = `
    <span>${AUTH.full_name || AUTH.username}</span>
    <span style="opacity:.6;font-weight:400">${ROLE_LABEL[AUTH.role]||AUTH.role}</span>
    <span title="تسجيل الخروج" onclick="doLogout()" style="padding:2px 6px;border-radius:5px;background:var(--red-s);color:var(--red);font-size:11px;cursor:pointer">خروج</span>
  `;

  const tbRight = document.querySelector('.tb-right');
  if (tbRight) tbRight.insertBefore(badge, tbRight.firstChild);
}

// ══════════════════════════════════════════════════════════════════
// LICENSE BANNER
// ══════════════════════════════════════════════════════════════════
function showLicenseBanner(lic) {
  if (!lic) return;
  document.getElementById('license-banner')?.remove();
  if (lic.ok && !lic.grace && (lic.days_left === undefined || lic.days_left > 10)) return;

  const banner = document.createElement('div');
  banner.id    = 'license-banner';

  const isGrace   = lic.grace;
  const isExpired = !lic.ok;
  const bg   = isExpired ? 'var(--red)'   : isGrace ? 'var(--amb)'   : 'var(--acc)';
  const icon = isExpired ? '🔒'           : isGrace ? '⚠️'           : '📅';
  const msg  = lic.message ||
    (lic.days_left !== undefined && lic.days_left <= 10
      ? `ينتهي الاشتراك خلال ${lic.days_left} يوم`
      : '');

  if (!msg) return;

  banner.style.cssText = `
    position:fixed;top:56px;left:0;right:0;z-index:55;
    background:${bg};color:white;
    padding:9px 18px;font-size:13px;font-weight:700;
    text-align:center;direction:rtl;
    display:flex;align-items:center;justify-content:center;gap:8px;
  `;
  banner.innerHTML = `
    <span>${icon} ${msg}</span>
    ${isExpired || isGrace
      ? `<span style="padding:3px 12px;border-radius:6px;background:rgba(255,255,255,.2);font-size:12px;cursor:pointer" onclick="showPage('settings',null)">تجديد الاشتراك</span>`
      : ''}
    <span style="margin-right:auto;opacity:.7;cursor:pointer;font-size:16px" onclick="this.parentElement.remove()">✕</span>
  `;
  document.getElementById('main')?.prepend(banner);

  // Push content down
  const content = document.getElementById('content');
  if (content) content.style.paddingTop = '38px';
}

// ══════════════════════════════════════════════════════════════════
// INJECT USERS PAGE  (admin only — built dynamically)
// ══════════════════════════════════════════════════════════════════
function _injectUsersSidebarBtn() {
  if (document.getElementById('sb-btn-users')) return;
  const btn = document.createElement('button');
  btn.id        = 'sb-btn-users';
  btn.className = 'sb-btn';
  btn.setAttribute('onclick', "showPage('users',this)");
  btn.innerHTML = `
    <svg class="sb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
    </svg>
    <span>إدارة المستخدمين</span><span class="sb-dot"></span>`;

  // Insert it inside the النظام section — after settings button
  const settingsBtn = document.querySelector('[onclick*="showPage(\'settings\'"]');
  if (settingsBtn) {
    settingsBtn.parentNode.insertBefore(btn, settingsBtn.nextSibling);
  }
}

function _injectUsersTabMore() {
  if (document.getElementById('tab-more-users')) return;
  const btn = document.createElement('button');
  btn.id        = 'tab-more-users';
  btn.className = 'tab-more-item';
  btn.setAttribute('onclick', "showPage('users',null);closeTabMore()");
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:22px;height:22px">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
    </svg>
    المستخدمين`;
  document.getElementById('tab-more-panel')?.appendChild(btn);
}

function _injectUsersPage() {
  if (document.getElementById('page-users')) return;
  const page = document.createElement('div');
  page.id        = 'page-users';
  page.className = 'page';
  page.innerHTML = `
<div class="page-head">
  <div>
    <div class="page-title">إدارة المستخدمين</div>
    <div class="page-sub">إضافة وتعديل مستخدمي العيادة وصلاحياتهم</div>
  </div>
  <div style="display:flex;gap:8px">
    <button class="btn btn-primary btn-sm" onclick="openUserModal()">+ مستخدم جديد</button>
    <button class="btn btn-ghost btn-sm" onclick="loadUsersPage()">تحديث</button>
  </div>
</div>

<!-- License Management Card -->
<div class="card" style="margin-bottom:16px;border:2px solid var(--acc-m)">
  <div class="card-title" style="display:flex;align-items:center;justify-content:space-between">
    <span>🔑 إدارة الترخيص</span>
    <button class="btn btn-ghost btn-sm" onclick="loadLicenseInfo()">تحديث</button>
  </div>
  <div id="license-info-card">
    <div style="color:var(--txt3);font-size:13px;padding:8px 0">جارٍ التحميل...</div>
  </div>
  <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--bdr)">
    <div style="font-size:13px;font-weight:700;color:var(--txt2);margin-bottom:10px">تجديد / إضافة اشتراك</div>
    <div class="form-row form-row-3" style="gap:10px">
      <div class="fg">
        <label>الخطة</label>
        <select id="lic-plan">
          <option value="monthly">شهري — 30,000 د.ع</option>
          <option value="bimonthly">شهران — 75,000 د.ع</option>
          <option value="biannual">6 أشهر — 210,000 د.ع</option>
          <option value="trial">تجريبي — مجاني</option>
        </select>
      </div>
      <div class="fg">
        <label>رقم الإيصال / المرجع</label>
        <input id="lic-ref" placeholder="اختياري">
      </div>
      <div class="fg">
        <label>تاريخ البدء</label>
        <input id="lic-start" type="date">
      </div>
    </div>
    <button class="btn btn-green btn-sm" style="margin-top:10px" onclick="saveLicense()">
      💾 حفظ الاشتراك
    </button>
  </div>
</div>

<!-- Users Table -->
<div class="ptable-wrap">
  <div id="users-body"></div>
</div>

<!-- Change My Password -->
<div class="card" style="margin-top:16px;max-width:420px">
  <div class="card-title">🔐 تغيير كلمة المرور الخاصة بي</div>
  <div class="form-grid">
    <div class="fg"><label>كلمة المرور الحالية</label><input id="chpw-old" type="password"></div>
    <div class="fg"><label>كلمة المرور الجديدة</label><input id="chpw-new" type="password" placeholder="6 أحرف على الأقل"></div>
    <div class="fg"><label>تأكيد كلمة المرور</label><input id="chpw-conf" type="password"></div>
  </div>
  <button class="btn btn-primary btn-sm" style="margin-top:12px" onclick="changeMyPassword()">حفظ كلمة المرور</button>
</div>`;
  document.getElementById('content')?.appendChild(page);
}

// ══════════════════════════════════════════════════════════════════
// USERS PAGE LOGIC
// ══════════════════════════════════════════════════════════════════
let _editUserId = null;

async function loadUsersPage() {
  const resp = await fetch('/api/users');
  if (!resp.ok) return;
  const users = await resp.json();

  const el = document.getElementById('users-body');
  if (!el) return;

  if (!users.length) {
    el.innerHTML = '<div class="empty"><p>لا مستخدمين</p></div>';
    return;
  }

  const fmtDate = d => d ? new Date(d).toLocaleDateString('ar-IQ', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
  const roleColor = { admin:'badge-red', doctor:'badge-blue', receptionist:'badge-green' };
  const roleAr    = { admin:'مدير', doctor:'طبيب', receptionist:'موظف استقبال' };

  el.innerHTML = `<table>
    <thead><tr>
      <th>اسم المستخدم</th><th>الاسم الكامل</th><th>الدور</th>
      <th>آخر دخول</th><th>الحالة</th><th></th>
    </tr></thead>
    <tbody>` +
    users.map(u => `<tr>
      <td class="td-name" style="font-family:var(--mono)">${u.username}</td>
      <td>${u.full_name || '—'}</td>
      <td><span class="badge ${roleColor[u.role]||'badge-amb'}">${roleAr[u.role]||u.role}</span></td>
      <td class="td-id">${fmtDate(u.last_login)}</td>
      <td><span class="badge ${u.is_active?'badge-green':'badge-red'}">${u.is_active?'نشط':'معطّل'}</span></td>
      <td><div style="display:flex;gap:5px">
        ${u.username !== AUTH.username
          ? `<button class="btn btn-ghost btn-sm" onclick="openUserModal(${u.id})">تعديل</button>
             <button class="btn btn-red btn-sm" onclick="deleteUser(${u.id},'${u.username}')">حذف</button>`
          : '<span style="font-size:12px;color:var(--txt3)">حسابك</span>'}
      </div></td>
    </tr>`).join('') +
    '</tbody></table>';

  loadLicenseInfo();
}

async function loadLicenseInfo() {
  const el = document.getElementById('license-info-card');
  if (!el) return;
  try {
    const resp = await fetch('/api/license');
    const lic  = await resp.json();

    const planAr = { monthly:'شهري', bimonthly:'شهران', biannual:'6 أشهر', trial:'تجريبي', lifetime:'مدى الحياة' };
    const color  = lic.ok ? (lic.grace ? 'var(--amb)' : 'var(--grn)') : 'var(--red)';
    const icon   = lic.ok ? (lic.grace ? '⚠️' : '✅') : '🔒';

    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div style="font-size:28px">${icon}</div>
        <div>
          <div style="font-size:15px;font-weight:700;color:${color}">
            ${lic.ok ? 'الاشتراك نشط' : 'الاشتراك منتهٍ'}
            ${lic.grace ? ' — فترة السماح' : ''}
          </div>
          <div style="font-size:13px;color:var(--txt3);margin-top:3px">
            ${lic.plan ? 'الخطة: ' + (planAr[lic.plan]||lic.plan) : ''}
            ${lic.expires ? ' · ينتهي: ' + lic.expires : ''}
            ${lic.days_left !== undefined ? ' · متبقي: ' + lic.days_left + ' يوم' : ''}
            ${lic.days_late !== undefined ? ' · متأخر: ' + lic.days_late + ' يوم' : ''}
          </div>
          ${lic.message ? `<div style="font-size:12.5px;color:${color};margin-top:4px;font-weight:600">${lic.message}</div>` : ''}
        </div>
      </div>`;

    // Pre-fill start date
    const startEl = document.getElementById('lic-start');
    if (startEl && !startEl.value) startEl.value = new Date().toISOString().split('T')[0];

    // Update global banner
    showLicenseBanner(lic);
  } catch(e) {
    el.innerHTML = '<div style="color:var(--red);font-size:13px">فشل تحميل معلومات الترخيص</div>';
  }
}

async function saveLicense() {
  const plan  = document.getElementById('lic-plan')?.value;
  const ref   = document.getElementById('lic-ref')?.value.trim();
  const start = document.getElementById('lic-start')?.value;

  const resp = await fetch('/api/license', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan, payment_ref: ref, starts_at: start }),
  });
  const data = await resp.json();
  if (data.ok) {
    if (typeof toast === 'function') toast(`✅ تم حفظ الاشتراك — ينتهي: ${data.expires}`, 'green');
    loadLicenseInfo();
  } else {
    if (typeof toast === 'function') toast('خطأ: ' + (data.error||''), 'red');
  }
}

// ── User modal (reuse existing modal infrastructure) ──────────────
function openUserModal(id) {
  _editUserId = id || null;

  // Build a simple inline modal
  const existing = document.getElementById('modal-user');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id        = 'modal-user';
  modal.className = 'modal-overlay open';
  modal.innerHTML = `
<div class="modal" style="max-width:440px">
  <div class="modal-head">
    <div class="modal-title">${id ? 'تعديل مستخدم' : 'مستخدم جديد'}</div>
    <button class="close-btn" onclick="document.getElementById('modal-user').remove()">✕</button>
  </div>
  <div class="modal-body">
    <div class="form-grid">
      <div class="fg"><label>اسم المستخدم (للدخول)</label>
        <input id="um-username" placeholder="مثال: dr.ahmed" ${id?'readonly style="background:var(--bg3)"':''}></div>
      <div class="fg"><label>الاسم الكامل</label>
        <input id="um-fullname" placeholder="د. أحمد محمد"></div>
      <div class="fg"><label>الدور</label>
        <select id="um-role">
          <option value="receptionist">💼 موظف استقبال</option>
          <option value="doctor">👨‍⚕️ طبيب</option>
          <option value="admin">🔑 مدير</option>
        </select>
      </div>
      <div class="fg"><label>${id ? 'كلمة المرور الجديدة (اتركها فارغة للإبقاء)' : 'كلمة المرور'}</label>
        <input id="um-password" type="password" placeholder="6 أحرف على الأقل"></div>
      ${id ? `<div class="fg"><label>الحالة</label>
        <select id="um-active"><option value="true">نشط</option><option value="false">معطّل</option></select>
      </div>` : ''}
    </div>
  </div>
  <div class="modal-foot">
    <button class="btn btn-ghost" onclick="document.getElementById('modal-user').remove()">إلغاء</button>
    <button class="btn btn-primary" onclick="saveUser()">حفظ</button>
  </div>
</div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

  // Pre-fill if editing
  if (id) {
    fetch('/api/users').then(r => r.json()).then(users => {
      const u = users.find(x => x.id === id);
      if (!u) return;
      document.getElementById('um-username').value = u.username || '';
      document.getElementById('um-fullname').value = u.full_name || '';
      document.getElementById('um-role').value     = u.role || 'receptionist';
      const activeEl = document.getElementById('um-active');
      if (activeEl) activeEl.value = u.is_active ? 'true' : 'false';
    });
  }
}

async function saveUser() {
  const username  = document.getElementById('um-username')?.value.trim();
  const full_name = document.getElementById('um-fullname')?.value.trim();
  const role      = document.getElementById('um-role')?.value;
  const password  = document.getElementById('um-password')?.value;
  const is_active = document.getElementById('um-active')?.value !== 'false';

  if (!username && !_editUserId) { if (typeof toast === 'function') toast('أدخل اسم المستخدم', 'red'); return; }
  if (!password && !_editUserId) { if (typeof toast === 'function') toast('أدخل كلمة المرور', 'red'); return; }

  const payload = { id: _editUserId, username, full_name, role, is_active };
  if (password) payload.password = password;

  const resp = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await resp.json();
  if (data.ok || data.id) {
    document.getElementById('modal-user')?.remove();
    if (typeof toast === 'function') toast(_editUserId ? 'تم تحديث المستخدم' : 'تم إنشاء المستخدم', 'green');
    loadUsersPage();
  } else {
    if (typeof toast === 'function') toast('خطأ: ' + (data.error || ''), 'red');
  }
}

async function deleteUser(id, username) {
  if (!confirm(`حذف المستخدم "${username}" نهائياً؟`)) return;
  const resp = await fetch(`/api/users/${id}`, { method: 'DELETE' });
  const data = await resp.json();
  if (data.ok) {
    if (typeof toast === 'function') toast('تم الحذف', 'red');
    loadUsersPage();
  } else {
    if (typeof toast === 'function') toast('خطأ: ' + (data.error || ''), 'red');
  }
}

async function changeMyPassword() {
  const old_pw  = document.getElementById('chpw-old')?.value;
  const new_pw  = document.getElementById('chpw-new')?.value;
  const conf_pw = document.getElementById('chpw-conf')?.value;
  if (new_pw !== conf_pw) { if (typeof toast === 'function') toast('كلمتا المرور غير متطابقتين', 'red'); return; }
  if (!old_pw || !new_pw) { if (typeof toast === 'function') toast('أدخل كلمة المرور الحالية والجديدة', 'red'); return; }

  const resp = await fetch('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ old_password: old_pw, new_password: new_pw }),
  });
  const data = await resp.json();
  if (data.ok) {
    ['chpw-old','chpw-new','chpw-conf'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    if (typeof toast === 'function') toast('تم تغيير كلمة المرور ✓', 'green');
  } else {
    if (typeof toast === 'function') toast('خطأ: ' + (data.error || ''), 'red');
  }
}

// ══════════════════════════════════════════════════════════════════
// HOOK INTO showPage() — gate page navigation by role
// ══════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {
  // Wrap showPage to load users page content when navigating there
  const _origShowPage = window.showPage;
  window.showPage = function(page, btn) {
    const allowed = ROLE_PAGES[AUTH.role] || [];
    if (!allowed.includes(page) && AUTH.role) {
      if (typeof toast === 'function') toast('ليس لديك صلاحية لهذه الصفحة', 'red');
      return;
    }
    _origShowPage(page, btn);
    if (page === 'users') {
      loadUsersPage();
      document.getElementById('topbar-title').textContent = 'إدارة المستخدمين';
      document.getElementById('topbar-sub').textContent   = 'إضافة وتعديل مستخدمي العيادة';
      document.getElementById('btn-save').style.display   = 'none';
      document.getElementById('btn-clear').style.display  = 'none';
    }
  };
});

// ══════════════════════════════════════════════════════════════════
// BOOT — runs before index.html's DOMContentLoaded
// ══════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async function() {
  // Hide app immediately until we know auth state
  const appEl = document.getElementById('app');
  if (appEl) appEl.style.display = 'none';

  // Remove old PIN screen — auth.js replaces it
  const oldPin = document.getElementById('pin-screen');
  if (oldPin) oldPin.style.display = 'none';

  // Restore token from storage and try session check
  const storedToken = sessionStorage.getItem('noor_token');
  if (storedToken) AUTH.token = storedToken;

  try {
    const resp = await fetch('/api/auth/me');
    const data = await resp.json();

    if (data.authenticated) {
      AUTH.role        = data.role;
      AUTH.clinic_id   = data.clinic_id;
      AUTH.clinic_name = data.clinic_name || '';
      AUTH.license     = data.license;
      AUTH.username    = data.username || sessionStorage.getItem('noor_username') || '';

      if (appEl) appEl.style.display = '';
      setTimeout(() => {
        _applyClinicName(data.clinic_name);
        applyRoleGating();
        showLicenseBanner(data.license);
        updateUserBadge();
      }, 50);
    } else {
      showLoginScreen();
    }
  } catch(e) {
    // Can't reach server — still show login
    showLoginScreen('تعذّر الاتصال بالخادم');
  }
}, { once: false });

// (token injection already patched above — no further action needed)
