// --- Simple localStorage-backed blood matcher ---
const LS_KEYS = { donors: 'bdm_donors', users: 'bdm_users', session: 'bdm_session' };
const ADMIN_CRED = { user: 'admin', pass: 'admin123' }; // change for your deployment

// Init storage if missing
if(localStorage.getItem(LS_KEYS.donors) === null) localStorage.setItem(LS_KEYS.donors, '[]');
if(localStorage.getItem(LS_KEYS.users) === null) localStorage.setItem(LS_KEYS.users, '[]');

const getJSON = (k, d=null) => {
  try { return JSON.parse(localStorage.getItem(k)); } catch(e){ return d; }
};
const setJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const nowISO = () => new Date().toISOString();

// --- Session helpers ---
function setSession(obj){ setJSON(LS_KEYS.session, obj); }
function getSession(){ return getJSON(LS_KEYS.session); }
function clearSession(){ localStorage.removeItem(LS_KEYS.session); window.location.href = 'index.html'; }
function guardRoute(role){
  const s = getSession();
  if(!s || s.role !== role){ window.location.href = 'participant-login.html'; }
}
function renderSessionEmail(){
  const s = getSession();
  if(s?.email) $('#sessionEmail').text(s.email);
  $('#logoutBtn').on('click', clearSession);
}

// --- Utils ---
function escapeHtml(str=''){
  return String(str)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

function toast(msg, variant='primary'){
  let c = $('.toast-container');
  if(!c.length){
    c = $('<div class="toast-container"></div>').appendTo('body');
  }
  const id = 't' + Math.random().toString(36).slice(2);
  const el = $(`<div id="${id}" class="toast align-items-center text-bg-${variant} border-0" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="d-flex">
        <div class="toast-body">${escapeHtml(msg)}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    </div>`);
  c.append(el);
  const t = new bootstrap.Toast(el[0], { delay: 2500 });
  t.show();
  el.on('hidden.bs.toast', ()=> el.remove());
}

// --- Data layer ---
function readDonors(){ return getJSON(LS_KEYS.donors) || []; }
function addDonor(d){ const arr = readDonors(); arr.push(d); setJSON(LS_KEYS.donors, arr); }
function deleteDonor(idx){ const arr = readDonors(); arr.splice(idx,1); setJSON(LS_KEYS.donors, arr); }

// RBC compatibility (recipient -> acceptable donor groups)
const COMPAT = {
  'O-': ['O-'],
  'O+': ['O-','O+'],
  'A-': ['O-','A-'],
  'A+': ['O-','O+','A-','A+'],
  'B-': ['O-','B-'],
  'B+': ['O-','O+','B-','B+'],
  'AB-': ['O-','A-','B-','AB-'],
  'AB+': ['O-','O+','A-','A+','B-','B+','AB-','AB+']
};

// --- Auth flows on login pages ---
$(function(){
  // Participant login page handler
  $('#participantLoginForm').on('submit', function(e){
    e.preventDefault();
    const email = $('#pEmail').val().trim().toLowerCase();
    const pass  = $('#pPassword').val();
    const users = getJSON(LS_KEYS.users) || [];
    const ok = users.find(u => u.email===email && u.pass===pass);
    if(ok){ setSession({ role:'participant', email }); window.location.href = 'donor.html'; }
    else toast('Invalid email or password','danger');
  });

  // Participant register
  $('#participantRegisterForm').on('submit', function(e){
    e.preventDefault();
    const email = $('#rpEmail').val().trim().toLowerCase();
    const pass  = $('#rpPassword').val();
    let users = getJSON(LS_KEYS.users) || [];
    if(users.find(u => u.email===email)) return toast('Email already registered','warning');
    users.push({ email, pass, createdAt: nowISO() });
    setJSON(LS_KEYS.users, users);
    toast('Account created. You can login now.','success');
    $('#showLogin').trigger('click');
  });

  // Admin login page handler
  $('#adminLoginForm').on('submit', function(e){
    e.preventDefault();
    const u = $('#aUser').val().trim();
    const p = $('#aPass').val();
    if(u===ADMIN_CRED.user && p===ADMIN_CRED.pass){
      setSession({ role:'admin', email:'admin' });
      window.location.href = 'admin.html';
    } else {
      toast('Wrong admin credentials','danger');
    }
  });
});

// --- Donor-only page binding ---
function bindDonorPage(){
  $('#donorForm').on('submit', function(e){
    e.preventDefault();
    const s = getSession();
    const donor = {
      name: $('#dName').val().trim(),
      group: $('#dGroup').val(),
      city: $('#dCity').val().trim(),
      phone: $('#dPhone').val().trim(),
      addedBy: s?.email || 'anon',
      createdAt: nowISO()
    };
    if(!donor.name || !donor.group || !donor.city || !donor.phone) return toast('Please fill all fields','warning');
    addDonor(donor);
    this.reset();
    toast('Donor registered successfully','success');
  });
}

// --- Recipient-only page binding ---
function bindRecipientPage(){
  $('#reqForm').on('submit', function(e){
    e.preventDefault();
    const rG = $('#rGroup').val();
    const rC = $('#rCity').val().trim().toLowerCase();
    const donors = readDonors();
    const acceptable = new Set(COMPAT[rG]||[]);
    const results = donors
      .map((d,idx)=>({...d, idx}))
      .filter(d => acceptable.has(d.group) && (!rC || d.city.toLowerCase().includes(rC)));

    $('#matchResult').html(`<span class="badge bg-danger">${results.length}</span> match(es) for <strong>${rG}</strong>${rC?` in <strong>${escapeHtml($('#rCity').val())}</strong>`:''}.`);
    const grid = $('#donorList').empty();
    results.forEach(d => grid.append(renderDonorCard(d, d.idx)));
  });

  $('#clearDonors').on('click', function(){
    $('#matchResult').empty();
    $('#donorList').empty();
  });
}

// Card render
function renderDonorCard(d, idx){
  const when = new Date(d.createdAt).toLocaleString();
  return $(`<div class="col-md-6 col-xl-4">
    <div class="card h-100 shadow-sm">
      <div class="card-body">
        <h5 class="card-title mb-1">${escapeHtml(d.name)}</h5>
        <div class="mb-2">
          <span class="badge bg-danger me-1">${d.group}</span>
          <span class="text-secondary small"><i class="bi bi-geo-alt"></i> ${escapeHtml(d.city)}</span>
        </div>
        <a class="btn btn-outline-danger btn-sm" href="tel:${escapeHtml(d.phone)}"><i class="bi bi-telephone"></i> ${escapeHtml(d.phone)}</a>
      </div>
      <div class="card-footer bg-white text-secondary small">Added ${when} by ${escapeHtml(d.addedBy||'—')}</div>
    </div>
  </div>`);
}

// --- Admin page ---
function renderAdminTable(){
  const city = ($('#adminSearchCity').val()||'').trim().toLowerCase();
  const group = $('#adminSearchGroup').val();
  const tbody = $('#donorTable tbody').empty();
  readDonors().forEach((d, idx) => {
    if(group && d.group !== group) return;
    if(city && !d.city.toLowerCase().includes(city)) return;
    const tr = $(`<tr>
        <td>${idx+1}</td>
        <td>${escapeHtml(d.name)}</td>
        <td><span class="badge bg-danger">${d.group}</span></td>
        <td>${escapeHtml(d.city)}</td>
        <td><a href="tel:${escapeHtml(d.phone)}">${escapeHtml(d.phone)}</a></td>
        <td>${escapeHtml(d.addedBy||'—')}</td>
        <td>${new Date(d.createdAt).toLocaleString()}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-danger" data-idx="${idx}"><i class="bi bi-trash"></i></button>
        </td>
      </tr>`);
    tr.find('button').on('click', function(){
      const i = Number($(this).data('idx'));
      deleteDonor(i);
      toast('Donor removed','warning');
      renderAdminTable();
    });
    tbody.append(tr);
  });
}

function exportDonorsCSV(){
  const donors = readDonors();
  const head = ['Name','Group','City','Phone','AddedBy','CreatedAt'];
  const rows = donors.map(d => [d.name, d.group, d.city, d.phone, d.addedBy||'', d.createdAt]);
  const csv = [head, ...rows].map(r => r.map(v => '"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'donors.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}