import os, zipfile, textwrap

root = "/mnt/data/QUECARE-Patient-Frontend"
os.makedirs(root + "/frontend/css", exist_ok=True)
os.makedirs(root + "/frontend/js", exist_ok=True)
os.makedirs(root + "/frontend/assets", exist_ok=True)

files = {
"frontend/index.html": r'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="QUECARE helps patients request and track hospital queue tokens.">
  <title>QUECARE | Your visit, made simpler</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <header class="site-header">
    <a class="brand" href="index.html" aria-label="QUECARE home"><span class="brand-mark">Q</span><span>QUE<span class="brand-blue">CARE</span><small>SMARTER HOSPITAL QUEUES</small></span></a>
    <nav class="main-nav"><a class="active" href="index.html">Home</a><a href="queue.html">Track token</a></nav>
    <a class="header-link" href="register.html">Get a token <span>→</span></a>
  </header>

  <main>
    <section class="hero wrap">
      <div class="hero-copy">
        <div class="eyebrow"><span class="pulse-dot"></span> A simpler hospital visit starts here</div>
        <h1>Less waiting.<br><span>More caring.</span></h1>
        <p class="hero-text">From hospital entry to your next step, QUECARE makes the queue easier to understand and easier to navigate.</p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="register.html">Get a token <span>→</span></a>
          <a class="btn btn-secondary" href="queue.html">Track existing token</a>
        </div>
        <div class="trust-note"><span class="shield">✓</span> Simple registration · Clear queue updates · Helpful directions</div>
      </div>
      <div class="hero-visual">
        <div class="visual-glow"></div>
        <div class="phone-card">
          <div class="phone-top"><span>QUECARE</span><span class="live-label"><i></i> LIVE DEMO</span></div>
          <div class="phone-greeting">Your visit at a glance</div>
          <div class="mini-token">
            <span class="mini-label">SAMPLE TOKEN</span>
            <strong>A-024</strong>
            <span class="mini-status">Waiting</span>
          </div>
          <div class="queue-line"><span>Now serving</span><strong>A-021</strong></div>
          <div class="queue-line"><span>People ahead</span><strong>3</strong></div>
          <div class="progress-track"><span></span></div>
          <div class="direction-box"><span class="direction-icon">↗</span><span><b>Next step</b><small>Please wait in the General Medicine waiting area.</small></span></div>
        </div>
        <div class="float-pill pill-one"><span>✓</span> Easy token access</div>
        <div class="float-pill pill-two"><span>⌖</span> Clear directions</div>
      </div>
    </section>

    <section class="benefits wrap">
      <div class="section-heading"><span class="eyebrow">HOW QUECARE HELPS</span><h2>A clearer way through your visit</h2><p>Only the essentials patients need, right when they need them.</p></div>
      <div class="benefit-grid">
        <article class="benefit-card"><div class="benefit-icon blue-icon">01</div><h3>Get your token</h3><p>Enter a few details and request a queue token for your department.</p></article>
        <article class="benefit-card"><div class="benefit-icon aqua-icon">02</div><h3>Follow your queue</h3><p>Check the current token being served and how many people are ahead.</p></article>
        <article class="benefit-card"><div class="benefit-icon violet-icon">03</div><h3>Know where to go</h3><p>See the next-step instructions shared by the hospital team.</p></article>
      </div>
    </section>

    <section class="cta-band wrap"><div><span class="eyebrow light-eyebrow">READY WHEN YOU ARE</span><h2>Start your visit with one simple step.</h2></div><a class="btn btn-white" href="register.html">Get a token <span>→</span></a></section>
  </main>

  <footer class="site-footer"><a class="brand footer-brand" href="index.html"><span class="brand-mark">Q</span><span>QUE<span class="brand-blue">CARE</span><small>SMARTER HOSPITAL QUEUES</small></span></a><p>Making hospital queues easier to navigate.</p><small>Demo interface · Not connected to a real hospital system</small></footer>
  <script src="js/app.js"></script>
</body>
</html>''',

"frontend/register.html": r'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Get a token | QUECARE</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <header class="site-header">
    <a class="brand" href="index.html"><span class="brand-mark">Q</span><span>QUE<span class="brand-blue">CARE</span><small>SMARTER HOSPITAL QUEUES</small></span></a>
    <nav class="main-nav"><a href="index.html">Home</a><a href="queue.html">Track token</a></nav>
    <a class="header-link" href="index.html">← Back to home</a>
  </header>

  <main class="form-page wrap">
    <div class="form-intro">
      <span class="eyebrow"><span class="pulse-dot"></span> PATIENT REGISTRATION</span>
      <h1>Let's get your<br><span>visit started.</span></h1>
      <p>Share a few basic details to request a demo queue token. It only takes a moment.</p>
      <div class="form-points"><div><span>✓</span> Simple, short form</div><div><span>✓</span> Department-based queue</div><div><span>✓</span> Clear next-step guidance</div></div>
      <div class="privacy-note"><span>ⓘ</span><p><b>Demo project:</b> Please use fictional details only. This prototype does not send information to a hospital.</p></div>
    </div>

    <section class="form-card">
      <div class="form-card-heading"><div class="form-icon">✚</div><div><h2>Patient details</h2><p>All fields are required for this demo.</p></div></div>
      <form id="registration-form">
        <label for="patient-name">Full name</label>
        <input id="patient-name" name="name" type="text" placeholder="e.g. Aanya Sharma" autocomplete="name" maxlength="70" required>
        <label for="mobile">Mobile number</label>
        <div class="phone-input"><span>+91</span><input id="mobile" name="mobile" type="tel" inputmode="numeric" placeholder="10-digit mobile number" maxlength="10" pattern="[6-9][0-9]{9}" required></div>
        <label for="department">Choose department</label>
        <div class="select-wrap"><select id="department" name="department" required><option value="">Select a department</option><option>General Medicine</option><option>Cardiology</option><option>Orthopaedics</option><option>Dermatology</option><option>Paediatrics</option></select></div>
        <button class="btn btn-primary btn-full" type="submit">Request demo token <span>→</span></button>
        <p class="form-error" id="form-error" role="alert"></p>
        <p class="form-footnote">By continuing, you confirm this is a demonstration and not a real appointment booking.</p>
      </form>
    </section>
  </main>
  <footer class="simple-footer">© QUECARE · Patient demo experience</footer>
  <script src="js/app.js"></script>
</body>
</html>''',

"frontend/token.html": r'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your token | QUECARE</title><link rel="stylesheet" href="css/style.css">
</head>
<body>
  <header class="site-header">
    <a class="brand" href="index.html"><span class="brand-mark">Q</span><span>QUE<span class="brand-blue">CARE</span><small>SMARTER HOSPITAL QUEUES</small></span></a>
    <nav class="main-nav"><a href="index.html">Home</a><a href="queue.html">Track token</a></nav>
    <a class="header-link" href="index.html">Home</a>
  </header>
  <main class="result-page wrap">
    <div class="success-mark">✓</div><span class="eyebrow">DEMO TOKEN CREATED</span>
    <h1>You're in the <span>queue.</span></h1>
    <p class="result-subtitle">Here are the details for your demonstration token.</p>
    <section class="token-card">
      <div class="token-card-top"><span>YOUR TOKEN NUMBER</span><span class="status-chip">● Waiting</span></div>
      <div class="token-number" id="token-number">GM-001</div>
      <div class="token-details">
        <div><small>Patient</small><b id="token-patient">Demo Patient</b></div>
        <div><small>Department</small><b id="token-department">General Medicine</b></div>
        <div><small>Assigned doctor</small><b>To be assigned by hospital</b></div>
        <div><small>Room / counter</small><b>Check with reception</b></div>
      </div>
      <div class="notice-box"><span>ⓘ</span><p><b>Next step</b><br>Please visit the hospital reception desk for directions. This demo does not represent a real hospital queue.</p></div>
      <a class="btn btn-primary btn-full" href="queue.html">View queue status <span>→</span></a>
    </section>
    <a class="text-link" href="index.html">← Back to QUECARE home</a>
  </main>
  <footer class="simple-footer">© QUECARE · Demonstration only</footer>
  <script src="js/app.js"></script>
</body>
</html>''',

"frontend/queue.html": r'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Track your token | QUECARE</title><link rel="stylesheet" href="css/style.css">
</head>
<body>
  <header class="site-header">
    <a class="brand" href="index.html"><span class="brand-mark">Q</span><span>QUE<span class="brand-blue">CARE</span><small>SMARTER HOSPITAL QUEUES</small></span></a>
    <nav class="main-nav"><a href="index.html">Home</a><a class="active" href="queue.html">Track token</a></nav>
    <a class="header-link" href="register.html">Get a token <span>→</span></a>
  </header>
  <main class="queue-page wrap">
    <div class="section-heading"><span class="eyebrow">QUEUE TRACKING</span><h1>Stay in the <span>know.</span></h1><p>See a sample queue status or look up the token saved in this browser.</p></div>
    <section class="queue-card">
      <div class="queue-card-header"><div><small>YOUR TOKEN</small><h2 id="queue-token">DEMO-024</h2></div><span class="status-chip">● Waiting</span></div>
      <div class="queue-stats">
        <div class="queue-stat"><small>Currently serving</small><strong id="serving-token">DEMO-021</strong></div>
        <div class="queue-stat"><small>People ahead</small><strong id="people-ahead">3</strong></div>
      </div>
      <div class="queue-progress-label"><span>Queue progress</span><b>Demo status</b></div><div class="progress-track large"><span></span></div>
      <div class="next-step"><div class="direction-icon">↗</div><div><b>Your next step</b><p id="queue-instruction">Please check with reception for your department's waiting area.</p></div></div>
      <p class="demo-caption">Illustrative sample only. Queue values are not live and are not connected to hospital operations.</p>
    </section>
    <div class="queue-actions"><a class="btn btn-primary" href="register.html">Request another demo token</a><a class="btn btn-secondary" href="index.html">Back to home</a></div>
  </main>
  <footer class="simple-footer">© QUECARE · Demonstration only</footer>
  <script src="js/app.js"></script>
</body>
</html>''',

"frontend/css/style.css": r'''@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap');
:root{--blue:#1769d2;--blue-dark:#104eaa;--navy:#102b50;--ink:#183153;--muted:#6d7f96;--pale:#f3f7fd;--line:#e3ebf5;--white:#fff;--shadow:0 18px 55px rgba(20,65,120,.10)}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#fff;color:var(--ink);font-family:'DM Sans',Arial,sans-serif}a{color:inherit;text-decoration:none}.wrap{width:min(1120px,calc(100% - 48px));margin-inline:auto}.site-header{height:82px;padding:0 max(24px,calc((100% - 1120px)/2));display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #edf1f7;background:rgba(255,255,255,.94);position:relative;z-index:2}.brand{display:flex;align-items:center;gap:10px;font-family:Manrope,sans-serif;font-size:20px;font-weight:800;letter-spacing:-.7px}.brand-mark{width:38px;height:38px;display:grid;place-items:center;border-radius:12px;background:var(--blue);color:#fff;font-size:23px}.brand-blue{color:var(--blue)}.brand small{display:block;font:700 8px 'DM Sans',sans-serif;letter-spacing:1.35px;color:#8192a8;margin-top:1px}.main-nav{display:flex;gap:34px;color:#687c95;font-size:14px;font-weight:600}.main-nav a:hover,.main-nav a.active{color:var(--blue)}.header-link{font-size:14px;font-weight:700;color:var(--blue)}.header-link span{font-size:19px;margin-left:5px}.hero{display:grid;grid-template-columns:1.05fr .95fr;align-items:center;gap:55px;padding-top:82px;padding-bottom:86px;min-height:570px}.eyebrow{display:inline-flex;align-items:center;gap:9px;color:var(--blue);font-size:11px;font-weight:800;letter-spacing:1.45px}.pulse-dot{width:8px;height:8px;background:#29b58c;border-radius:50%;box-shadow:0 0 0 4px #e1f7ef}.hero h1,.form-intro h1,.section-heading h1{font:800 clamp(44px,5.5vw,66px)/1.08 Manrope,sans-serif;letter-spacing:-3px;color:var(--navy);margin:22px 0}.hero h1 span,.form-intro h1 span,.section-heading h1 span{color:var(--blue)}.hero-text{font-size:17px;line-height:1.8;color:var(--muted);max-width:490px}.hero-actions{display:flex;gap:13px;flex-wrap:wrap;margin-top:30px}.btn{min-height:49px;padding:0 22px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;gap:14px;font:700 14px 'DM Sans',sans-serif;border:1px solid transparent;cursor:pointer;transition:.2s}.btn-primary{background:var(--blue);color:#fff;box-shadow:0 8px 20px rgba(23,105,210,.18)}.btn-primary:hover{background:var(--blue-dark);transform:translateY(-1px)}.btn-secondary{background:#fff;color:var(--ink);border-color:var(--line)}.btn-secondary:hover{border-color:#a8c7ef;color:var(--blue)}.btn-white{background:#fff;color:var(--blue)}.btn-full{width:100%;margin-top:25px}.trust-note{margin-top:27px;font-size:12px;color:#8493a6}.shield{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;background:#e7f7f1;color:#15966f;font-weight:800;margin-right:6px}.hero-visual{min-height:400px;display:grid;place-items:center;position:relative;background:radial-gradient(ellipse at center,#e7f1ff 0%,#f5f9ff 47%,#fff 72%)}.visual-glow{position:absolute;width:310px;height:310px;border-radius:50%;background:#dceaff;filter:blur(2px)}.phone-card{z-index:1;width:min(310px,82%);background:#fff;border:1px solid #e8eff8;border-radius:23px;padding:23px;box-shadow:0 25px 65px rgba(25,77,143,.16);transform:rotate(2deg)}.phone-top{display:flex;justify-content:space-between;align-items:center;font:800 13px Manrope;color:var(--navy)}.live-label{font:700 8px 'DM Sans';letter-spacing:.8px;color:#16a078;background:#eaf9f4;padding:6px 8px;border-radius:20px}.live-label i{display:inline-block;width:5px;height:5px;border-radius:50%;background:#16a078;margin-right:4px}.phone-greeting{font-size:12px;color:var(--muted);margin:25px 0 12px}.mini-token{background:linear-gradient(135deg,#1769d2,#3789ed);color:#fff;padding:18px;border-radius:14px;position:relative}.mini-label{display:block;font-size:9px;letter-spacing:1.2px;opacity:.8}.mini-token strong{display:block;font:800 35px Manrope;margin:4px 0}.mini-status{position:absolute;right:14px;top:17px;font-size:10px;background:#ffffff26;padding:5px 8px;border-radius:20px}.queue-line{display:flex;justify-content:space-between;padding:15px 1px 10px;border-bottom:1px solid #edf1f6;font-size:11px;color:var(--muted)}.queue-line strong{color:var(--navy);font-size:13px}.progress-track{height:6px;background:#edf2f8;border-radius:9px;overflow:hidden;margin:14px 0}.progress-track span{display:block;width:68%;height:100%;background:#36b995;border-radius:9px}.direction-box{display:flex;gap:10px;align-items:center;background:#f2f7ff;padding:12px;border-radius:11px;margin-top:17px}.direction-icon{width:32px;height:32px;flex:none;border-radius:9px;display:grid;place-items:center;background:#dceaff;color:var(--blue);font-size:20px}.direction-box b,.direction-box small{display:block}.direction-box b{font-size:11px}.direction-box small{font-size:9px;color:var(--muted);line-height:1.5;margin-top:3px}.float-pill{position:absolute;z-index:2;background:#fff;padding:12px 15px;border-radius:12px;box-shadow:var(--shadow);font-size:11px;font-weight:700;color:var(--ink)}.float-pill span{color:#16a078;margin-right:6px}.pill-one{top:65px;left:0}.pill-two{bottom:58px;right:0}.benefits{padding:45px 0 90px}.section-heading{text-align:center}.section-heading h2{font:800 32px Manrope;letter-spacing:-1.2px;color:var(--navy);margin:13px 0}.section-heading p{color:var(--muted);font-size:14px}.benefit-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:37px}.benefit-card{padding:25px;border:1px solid var(--line);border-radius:15px;background:#fff}.benefit-icon{width:39px;height:39px;display:grid;place-items:center;border-radius:11px;font-weight:800;font-size:12px}.blue-icon{background:#e8f1ff;color:#1769d2}.aqua-icon{background:#e5f8f4;color:#159c7c}.violet-icon{background:#f0edff;color:#7462d8}.benefit-card h3{font:700 17px Manrope;color:var(--navy);margin:19px 0 8px}.benefit-card p{font-size:13px;line-height:1.7;color:var(--muted);margin:0}.cta-band{background:linear-gradient(110deg,#155fc0,#287fe3);border-radius:18px;padding:32px 40px;margin-bottom:75px;display:flex;align-items:center;justify-content:space-between;color:#fff}.light-eyebrow{color:#cde1ff}.cta-band h2{font:700 23px Manrope;margin:10px 0 0}.site-footer{border-top:1px solid #edf1f7;padding:28px max(24px,calc((100% - 1120px)/2));display:flex;align-items:center;justify-content:space-between;gap:20px}.site-footer p,.site-footer>small{font-size:11px;color:#8493a6}.footer-brand{font-size:16px}.footer-brand .brand-mark{width:32px;height:32px;font-size:19px}
.form-page{display:grid;grid-template-columns:1fr 1fr;gap:85px;align-items:center;padding-top:75px;padding-bottom:75px;min-height:calc(100vh - 140px)}.form-intro h1{font-size:53px;margin:20px 0}.form-intro>p{color:var(--muted);font-size:15px;line-height:1.8;max-width:410px}.form-points{display:grid;gap:13px;margin-top:27px;font-size:13px;font-weight:600;color:#4c617b}.form-points span{display:inline-grid;place-items:center;width:19px;height:19px;border-radius:50%;background:#e4f7f0;color:#15966f;margin-right:8px}.privacy-note{display:flex;gap:11px;align-items:flex-start;background:#f2f7ff;border:1px solid #e2edfc;padding:13px;border-radius:10px;margin-top:32px;max-width:410px;color:var(--blue)}.privacy-note p{margin:0;color:#627790;font-size:11px;line-height:1.6}.privacy-note b{color:var(--navy)}.form-card{padding:34px;background:#fff;border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow)}.form-card-heading{display:flex;align-items:center;gap:13px;margin-bottom:27px}.form-icon{width:43px;height:43px;display:grid;place-items:center;border-radius:12px;background:#eaf2ff;color:var(--blue);font-size:20px}.form-card h2{font:700 20px Manrope;color:var(--navy);margin:0 0 4px}.form-card-heading p{font-size:12px;color:var(--muted);margin:0}.form-card label{display:block;font-size:12px;font-weight:700;color:#334b68;margin:19px 0 8px}.form-card input,.form-card select{width:100%;height:48px;border:1px solid #dce5f0;border-radius:8px;padding:0 13px;font:14px 'DM Sans';color:var(--ink);background:#fff;outline:none}.form-card input:focus,.form-card select:focus{border-color:var(--blue);box-shadow:0 0 0 3px #e9f2ff}.form-card input::placeholder{color:#a2afbf}.phone-input{display:flex;align-items:center;border:1px solid #dce5f0;border-radius:8px;height:48px}.phone-input:focus-within{border-color:var(--blue);box-shadow:0 0 0 3px #e9f2ff}.phone-input span{padding:0 12px;color:#60758e;font-size:13px;border-right:1px solid #e5ebf3}.phone-input input{border:0;box-shadow:none!important}.select-wrap{position:relative}.select-wrap:after{content:'⌄';position:absolute;right:15px;top:11px;color:#71839a;pointer-events:none}.form-card select{appearance:none}.form-footnote{font-size:10px;line-height:1.6;color:#92a0b1;text-align:center;margin:12px 0 0}.form-error{font-size:12px;color:#c0392b;min-height:15px;margin:8px 0 0}.simple-footer{text-align:center;border-top:1px solid #edf1f7;padding:22px;color:#91a0b1;font-size:11px}
.result-page,.queue-page{max-width:760px;padding-top:60px;padding-bottom:70px;text-align:center}.success-mark{width:54px;height:54px;display:grid;place-items:center;border-radius:50%;background:#e5f8f0;color:#169a70;font-size:25px;margin:0 auto 18px}.result-page h1,.queue-page h1{font:800 42px Manrope;letter-spacing:-1.7px;color:var(--navy);margin:13px 0}.result-page h1 span,.queue-page h1 span{color:var(--blue)}.result-subtitle,.section-heading>p{color:var(--muted);font-size:14px}.token-card,.queue-card{max-width:540px;margin:32px auto 22px;text-align:left;background:#fff;border:1px solid var(--line);border-radius:17px;padding:27px;box-shadow:var(--shadow)}.token-card-top,.queue-card-header{display:flex;justify-content:space-between;align-items:center}.token-card-top>span:first-child,.queue-card-header small{font-size:10px;letter-spacing:1.2px;color:#8292a6;font-weight:800}.status-chip{background:#fff5df;color:#a96d00;padding:7px 10px;border-radius:20px;font-size:10px;font-weight:700}.token-number{font:800 48px Manrope;color:var(--blue);padding:12px 0 20px;border-bottom:1px solid var(--line)}.token-details{display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:22px 0}.token-details small,.token-details b{display:block}.token-details small,.queue-stat small{font-size:11px;color:#8292a6;margin-bottom:6px}.token-details b{font-size:12px;color:var(--navy)}.notice-box,.next-step{display:flex;gap:12px;align-items:flex-start;background:#f1f6ff;border-radius:10px;padding:14px;margin-bottom:5px}.notice-box>span{color:var(--blue)}.notice-box p{font-size:11px;line-height:1.6;color:#667b95;margin:0}.notice-box b{color:var(--navy)}.text-link{font-size:12px;color:var(--blue);font-weight:700}.queue-page{max-width:800px}.queue-card-header h2{font:800 32px Manrope;color:var(--blue);margin:5px 0}.queue-stats{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:24px 0}.queue-stat{background:#f5f8fd;border-radius:11px;padding:17px}.queue-stat strong{display:block;font:800 26px Manrope;color:var(--navy)}.queue-progress-label{display:flex;justify-content:space-between;font-size:11px;color:#74869d}.queue-progress-label b{color:#159a75}.progress-track.large{height:8px;margin:10px 0 22px}.next-step{margin-top:10px}.next-step p{font-size:12px;line-height:1.6;color:#667b95;margin:5px 0 0}.next-step b{font-size:13px;color:var(--navy)}.demo-caption{text-align:center;font-size:10px;line-height:1.5;color:#9aa7b6;margin:17px 0 0}.queue-actions{display:flex;justify-content:center;gap:12px;flex-wrap:wrap}
@media(max-width:800px){.hero{grid-template-columns:1fr;gap:20px;padding-top:60px}.hero-copy{text-align:center}.hero-text{margin-inline:auto}.hero-actions{justify-content:center}.trust-note{line-height:1.7}.hero-visual{min-height:380px}.benefit-grid{grid-template-columns:1fr}.cta-band{gap:20px;padding:27px;flex-direction:column;text-align:center}.form-page{grid-template-columns:1fr;gap:35px;padding-top:45px}.form-intro{text-align:center}.form-intro>p,.privacy-note{margin-inline:auto}.form-points{text-align:left;width:max-content;margin-inline:auto}.form-intro h1{font-size:44px}.site-footer{flex-wrap:wrap;justify-content:center;text-align:center}.site-footer>*{width:100%;text-align:center}.main-nav{gap:14px;font-size:12px}.header-link{font-size:12px}.site-header{height:72px}.brand{font-size:17px}.brand-mark{width:33px;height:33px}}
@media(max-width:480px){.wrap{width:calc(100% - 32px)}.site-header{padding:0 16px}.main-nav{display:none}.hero h1{font-size:48px}.hero-actions .btn{width:100%}.phone-card{width:270px}.pill-one{left:-4px}.pill-two{right:-4px}.form-card{padding:23px}.result-page h1,.queue-page h1{font-size:34px}.token-card,.queue-card{padding:20px}.token-number{font-size:42px}}
''',

"frontend/js/app.js": r'''// QUECARE patient frontend demo.
// This uses browser localStorage only. It does NOT connect to a hospital or backend.

function readDemoPatient() {
  try {
    return JSON.parse(localStorage.getItem("quecareDemoPatient") || "null");
  } catch {
    return null;
  }
}

const registrationForm = document.getElementById("registration-form");

if (registrationForm) {
  registrationForm.addEventListener("submit", function (event) {
    event.preventDefault();

    const name = document.getElementById("patient-name").value.trim();
    const mobile = document.getElementById("mobile").value.trim();
    const department = document.getElementById("department").value;
    const error = document.getElementById("form-error");

    error.textContent = "";

    if (name.length < 2) {
      error.textContent = "Please enter a valid name (at least 2 characters).";
      return;
    }
    if (!/^[6-9][0-9]{9}$/.test(mobile)) {
      error.textContent = "Enter a valid 10-digit Indian mobile number.";
      return;
    }
    if (!department) {
      error.textContent = "Please select a department.";
      return;
    }

    // Demo token only: generated locally in this browser.
    const prefix = department === "General Medicine" ? "GM" :
      department === "Cardiology" ? "CR" :
      department === "Orthopaedics" ? "OR" :
      department === "Dermatology" ? "DR" : "PD";

    const previous = readDemoPatient();
    const nextNumber = previous && previous.department === department
      ? Number(previous.sequence || 0) + 1 : 1;

    const patient = {
      name,
      mobile,
      department,
      sequence: nextNumber,
      token: `${prefix}-${String(nextNumber).padStart(3, "0")}`,
      createdAt: new Date().toISOString()
    };

    localStorage.setItem("quecareDemoPatient", JSON.stringify(patient));
    window.location.href = "token.html";
  });
}

if (document.getElementById("token-number")) {
  const patient = readDemoPatient();
  if (patient) {
    document.getElementById("token-number").textContent = patient.token;
    document.getElementById("token-patient").textContent = patient.name;
    document.getElementById("token-department").textContent = patient.department;
  }
}

if (document.getElementById("queue-token")) {
  const patient = readDemoPatient();
  if (patient) {
    document.getElementById("queue-token").textContent = patient.token;
    document.getElementById("serving-token").textContent = "Sample only";
    document.getElementById("people-ahead").textContent = "—";
    document.getElementById("queue-instruction").textContent =
      `Please check with reception for the ${patient.department} waiting area.`;
  }
}
'''
}

for rel, content in files.items():
    path = os.path.join(root, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

readme = """# QUECARE Patient Frontend (Demo)

A responsive blue-and-white patient-facing frontend with four screens:
- Home
- Patient registration
- Token confirmation
- Queue tracking

## Run locally
1. Extract the ZIP.
2. Open the `QUECARE-Patient-Frontend` folder in VS Code.
3. Install the **Live Server** extension.
4. In VS Code Explorer, open `frontend/index.html`.
5. Right-click and choose **Open with Live Server**.

Alternatively, open `frontend/index.html` directly in a browser. Live Server is recommended.

## Demo behavior
- Registration validates name, Indian mobile number format, and department.
- A demonstration token is created in browser `localStorage`.
- Token confirmation reads the locally stored demo details.
- Queue tracking shows clearly labeled sample information, not live queue data.

## Important limitations
This is frontend-only. It does not connect to a backend, database, hospital, doctor schedule, or real queue. Do not enter real patient information. Browser localStorage is not suitable for storing real patient data.

## Next development phase
Build a backend API, database, staff authentication, doctor routing, and real queue state before using this in any real-world setting.
"""
with open(os.path.join(root, "README.md"), "w", encoding="utf-8") as f:
    f.write(readme)

zip_path = "/mnt/data/QUECARE-Patient-Frontend.zip"
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
    for folder, _, filenames in os.walk(root):
        for filename in filenames:
            full = os.path.join(folder, filename)
            arc = os.path.relpath(full, os.path.dirname(root))
            z.write(full, arc)

print("Created:", zip_path)
print("Files:", len(files) + 1)
