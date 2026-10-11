const $ = q => document.querySelector(q);
const $$ = q => [...document.querySelectorAll(q)];

const titleMap = {
  level: { title: '01. Cấp học đang giảng dạy', tag: 'Cấp học' },
  aiExperience: { title: '03. Kinh nghiệm sử dụng công cụ AI', tag: 'Mức độ AI' },
  timeConsumingTasks: { title: '04. Khâu chuẩn bị bài tốn nhiều thời gian nhất', tag: 'Nỗi đau' },
  lessonPlanTroubles: { title: '05. Khó khăn khi soạn giáo án theo CV 5512', tag: 'Giáo án' },
  quizExpectations: { title: '06. Yêu cầu quan trọng với đề kiểm tra trắc nghiệm', tag: 'Đề thi' },
  visualNeeds: { title: '07. Nhu cầu về đồ họa & sơ đồ bài giảng', tag: 'Hình ảnh' },
  monthlyWorkload: { title: '08. Khối lượng bài giảng & đề thi mỗi tháng', tag: 'Tần suất' },
  flexiblePricing: { title: '09. Đánh giá cơ chế phí linh hoạt theo độ khó', tag: 'Định giá' },
  monthlyBudget: { title: '10. Ngân sách sẵn sàng chi trả mỗi tháng', tag: 'Khả năng trả' },
  primaryDevice: { title: '11. Thiết bị thường dùng để soạn bài', tag: 'Thiết bị' },
  // legacy
  payPerImage: { title: '[Cũ] Ý kiến giá 1.000đ/ảnh', tag: 'Legacy' },
  imageTroubles: { title: '[Cũ] Khó khăn khi tạo ảnh', tag: 'Legacy' },
  features: { title: '[Cũ] Tính năng mong muốn', tag: 'Legacy' }
};

let secret = '';
let currentData = null;
let allSubmissions = [];

function showError(message) { $('#adminError').textContent = message; }

async function authFetch(url) {
  const response = await fetch(url, { headers: { Authorization: 'Bearer ' + secret }, cache: 'no-store' });
  if (!response.ok) {
    const d = await response.json().catch(() => ({}));
    throw new Error(d.error || 'Yêu cầu thất bại.');
  }
  return response;
}

function formatDateTime(isoStr) {
  if (!isoStr) return '--';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  } catch { return isoStr; }
}

function formatRelativeTime(isoStr) {
  if (!isoStr) return '';
  const diffSec = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diffSec < 60) return 'Vừa gửi xong';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} phút trước`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} giờ trước`;
  return `${Math.floor(diffSec / 86400)} ngày trước`;
}

// Render Tab 1: Charts
function renderCharts(data) {
  const grid = $('#statGrid');
  grid.replaceChildren();

  Object.entries(titleMap).forEach(([key, meta]) => {
    const rawGroups = data.groups[key] || {};
    const values = Object.entries(rawGroups).sort((a, b) => b[1] - a[1]);
    if (!values.length && meta.tag === 'Legacy') return; // hide empty legacy

    const card = document.createElement('section');
    card.className = 'stat-card';

    const head = document.createElement('div');
    head.className = 'stat-card-head';
    const h3 = document.createElement('h3');
    h3.textContent = meta.title;
    const tag = document.createElement('span');
    tag.className = 'stat-card-tag';
    tag.textContent = meta.tag;
    head.append(h3, tag);
    card.append(head);

    if (!values.length) {
      const e = document.createElement('p');
      e.className = 'empty';
      e.style.color = '#94a3b8';
      e.style.fontSize = '12px';
      e.textContent = 'Chưa có câu trả lời cho mục này.';
      card.append(e);
    } else {
      const totalResponses = data.count || 1;
      values.forEach(([label, n]) => {
        const wrap = document.createElement('div');
        wrap.className = 'bar-entry';

        const top = document.createElement('div');
        top.className = 'bar-label';
        const text = document.createElement('span');
        text.textContent = label;

        const pct = ((n / totalResponses) * 100).toFixed(1);
        const count = document.createElement('b');
        count.textContent = `${n} (${pct}%)`;
        top.append(text, count);

        const track = document.createElement('div');
        track.className = 'bar-track';
        const fill = document.createElement('div');
        fill.className = 'bar-fill';
        fill.style.width = Math.max(3, (n / totalResponses) * 100) + '%';
        track.append(fill);

        wrap.append(top, track);
        card.append(wrap);
      });
    }

    grid.append(card);
  });
}

// Render Tab 2: Submissions Table
function renderSubmissionsTable(list) {
  const tbody = $('#subTableBody');
  tbody.replaceChildren();

  if (!list.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="9" style="text-align:center;padding:30px;color:#94a3b8">Không tìm thấy bài khảo sát nào phù hợp bộ lọc.</td>';
    tbody.append(tr);
    $('#filteredCount').textContent = '0';
    return;
  }

  $('#filteredCount').textContent = list.length.toLocaleString('vi-VN');

  list.forEach(sub => {
    const a = sub.answers || {};
    const tr = document.createElement('tr');

    const contactVal = (a.contact || '').trim();
    let contactBadge = '<span style="color:#94a3b8">--</span>';
    if (contactVal) {
      contactBadge = `<span class="sub-badge green" title="${contactVal}">📞 ${contactVal.slice(0, 14)}${contactVal.length > 14 ? '...' : ''}</span>`;
    }

    tr.innerHTML = `
      <td><span class="sub-id">#${sub.id}</span></td>
      <td>
        <div class="sub-time"><b>${formatDateTime(sub.createdAt).split(' ')[0]}</b></div>
        <div style="font-size:11px;color:#94a3b8">${formatRelativeTime(sub.createdAt)}</div>
      </td>
      <td><span class="sub-badge primary">${a.level || 'Chưa chọn'}</span></td>
      <td><b>${a.subject || 'Chung'}</b></td>
      <td><span style="font-size:12px">${a.flexiblePricing || a.payPerImage || '--'}</span></td>
      <td><span class="sub-badge">${a.monthlyBudget || '--'}</span></td>
      <td><span style="font-size:12px">${a.primaryDevice || '--'}</span></td>
      <td>${contactBadge}</td>
      <td>
        <button type="button" class="view-btn" data-sub-id="${sub.fullId || sub.id}">
          <span>Chi tiết</span>
          <span>↗</span>
        </button>
      </td>
    `;

    tbody.append(tr);
  });

  // Attach event listener to view buttons
  $$('.view-btn', tbody).forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.subId;
      const sub = allSubmissions.find(s => (s.fullId === id || s.id === id));
      if (sub) openModal(sub);
    });
  });
}

// Open Detail Modal
function openModal(sub) {
  const a = sub.answers || {};
  $('#modalSubId').textContent = '#' + sub.id;
  $('#modalSubTime').textContent = `Gửi lúc: ${formatDateTime(sub.createdAt)} (${formatRelativeTime(sub.createdAt)})`;

  const body = $('#modalBody');
  body.replaceChildren();

  // Helper for multiple tags
  const renderTags = arr => {
    if (!arr || (Array.isArray(arr) && !arr.length)) return '<span style="color:#94a3b8">Không chọn</span>';
    const items = Array.isArray(arr) ? arr : [arr];
    return `<div class="modal-tags">${items.map(t => `<span class="modal-tag">✓ ${t}</span>`).join('')}</div>`;
  };

  // Chapter 1
  const ch1 = document.createElement('div');
  ch1.className = 'modal-chapter';
  ch1.innerHTML = `
    <div class="modal-chapter-title"><span>01</span> Thông tin giáo viên & Kinh nghiệm AI</div>
    <div class="modal-q-item">
      <div class="modal-q-label">Cấp học đang giảng dạy:</div>
      <div class="modal-q-val"><span class="sub-badge primary">${a.level || 'Chưa chọn'}</span></div>
    </div>
    <div class="modal-q-item">
      <div class="modal-q-label">Môn học phụ trách:</div>
      <div class="modal-q-val"><b>${a.subject || 'Chưa ghi rõ'}</b></div>
    </div>
    <div class="modal-q-item">
      <div class="modal-q-label">Mức độ từng dùng công cụ AI:</div>
      <div class="modal-q-val">${a.aiExperience || 'Chưa chọn'}</div>
    </div>
  `;
  body.append(ch1);

  // Chapter 2
  const ch2 = document.createElement('div');
  ch2.className = 'modal-chapter';
  ch2.innerHTML = `
    <div class="modal-chapter-title"><span>02</span> Nhu cầu & Khó khăn sư phạm thực tế</div>
    <div class="modal-q-item">
      <div class="modal-q-label">Khâu chuẩn bị bài mất nhiều thời gian nhất:</div>
      ${renderTags(a.timeConsumingTasks || a.aiNeeds)}
    </div>
    <div class="modal-q-item">
      <div class="modal-q-label">Khó khăn lớn nhất khi soạn giáo án theo Công văn 5512:</div>
      ${renderTags(a.lessonPlanTroubles || a.imageTroubles)}
    </div>
    <div class="modal-q-item">
      <div class="modal-q-label">Yêu cầu quan trọng với đề kiểm tra trắc nghiệm:</div>
      ${renderTags(a.quizExpectations || a.features)}
    </div>
    <div class="modal-q-item">
      <div class="modal-q-label">Nhu cầu về hình ảnh & sơ đồ bài giảng:</div>
      ${renderTags(a.visualNeeds)}
    </div>
    <div class="modal-q-item">
      <div class="modal-q-label">Số lượng bài giảng / đề thi chuẩn bị mỗi tháng:</div>
      <div class="modal-q-val"><span class="sub-badge">${a.monthlyWorkload || a.monthlyUses || 'Chưa chọn'}</span></div>
    </div>
  `;
  body.append(ch2);

  // Chapter 3
  const ch3 = document.createElement('div');
  ch3.className = 'modal-chapter';
  ch3.innerHTML = `
    <div class="modal-chapter-title"><span>03</span> Chi phí linh hoạt & Ngân sách</div>
    <div class="modal-q-item">
      <div class="modal-q-label">Đánh giá cơ chế tính phí linh hoạt theo độ khó & chất lượng mô hình:</div>
      <div class="modal-q-val" style="color:#4338ca;font-weight:700">★ ${a.flexiblePricing || a.payPerImage || 'Chưa trả lời'}</div>
    </div>
    <div class="modal-q-item">
      <div class="modal-q-label">Ngân sách sẵn sàng chi trả mỗi tháng:</div>
      <div class="modal-q-val"><span class="sub-badge green">${a.monthlyBudget || 'Chưa chọn'}</span></div>
    </div>
  `;
  body.append(ch3);

  // Chapter 4
  const ch4 = document.createElement('div');
  ch4.className = 'modal-chapter';
  ch4.innerHTML = `
    <div class="modal-chapter-title"><span>04</span> Trải nghiệm thực tế & Tiếng nói Thầy/Cô</div>
    <div class="modal-q-item">
      <div class="modal-q-label">Thiết bị thường dùng để soạn bài:</div>
      <div class="modal-q-val"><span class="sub-badge">${a.primaryDevice || 'Chưa chọn'}</span></div>
    </div>
    <div class="modal-q-item">
      <div class="modal-q-label">Ý kiến đóng góp & mong muốn thêm:</div>
      ${a.suggestion ? `<div class="modal-quote">“${a.suggestion}”</div>` : '<span style="color:#94a3b8">Không để lại góp ý thêm.</span>'}
    </div>
    <div class="modal-q-item" style="margin-top:16px">
      <div class="modal-q-label">Thông tin liên hệ (SĐT / Zalo / Email):</div>
      ${a.contact ? `<div class="contact-box"><span>📞</span> <b>${a.contact}</b></div>` : '<span style="color:#94a3b8">Không cung cấp thông tin liên hệ.</span>'}
    </div>
  `;
  body.append(ch4);

  $('#detailModal').hidden = false;
}

function closeModal() { $('#detailModal').hidden = true; }

// Filter Table Logic
function applyFilter() {
  const query = ($('#tableSearch').value || '').toLowerCase().trim();
  const level = $('#levelFilter').value;

  const filtered = allSubmissions.filter(sub => {
    const a = sub.answers || {};
    if (level && a.level !== level) return false;
    if (!query) return true;

    const matchText = [
      sub.id,
      a.subject || '',
      a.suggestion || '',
      a.contact || '',
      a.level || '',
      a.flexiblePricing || a.payPerImage || '',
      a.monthlyBudget || ''
    ].join(' ').toLowerCase();

    return matchText.includes(query);
  });

  renderSubmissionsTable(filtered);
}

async function refresh() {
  const data = await (await authFetch('/api/admin/overview')).json();
  currentData = data;
  allSubmissions = data.submissions || [];

  // Sort submissions newest first
  allSubmissions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Update KPIs
  $('#total').textContent = data.count.toLocaleString('vi-VN');
  $('#sampleSize').textContent = data.count.toLocaleString('vi-VN');
  $('#submissionBadge').textContent = allSubmissions.length.toLocaleString('vi-VN');
  $('#totalTableCount').textContent = allSubmissions.length.toLocaleString('vi-VN');

  if (allSubmissions.length > 0) {
    const latest = allSubmissions[0];
    $('#kpiLatestTime').textContent = formatDateTime(latest.createdAt).split(' ')[0];
    $('#kpiLatestRelative').textContent = formatRelativeTime(latest.createdAt);
  } else {
    $('#kpiLatestTime').textContent = '--';
    $('#kpiLatestRelative').textContent = 'Chưa có';
  }

  const withContact = allSubmissions.filter(s => s.answers?.contact && s.answers.contact.trim()).length;
  const contactRate = allSubmissions.length > 0 ? ((withContact / allSubmissions.length) * 100).toFixed(0) : 0;
  $('#kpiContactRate').textContent = contactRate + '%';
  $('#kpiContactCount').textContent = withContact.toLocaleString('vi-VN');

  const withFeedback = allSubmissions.filter(s => s.answers?.suggestion && s.answers.suggestion.trim()).length;
  $('#kpiFeedbackCount').textContent = withFeedback.toLocaleString('vi-VN');

  // Render both views
  renderCharts(data);
  applyFilter();
}

// Auth Form
$('#adminAuth').addEventListener('submit', async e => {
  e.preventDefault();
  secret = $('#secret').value;
  showError('');
  try {
    await refresh();
    $('#adminAuth').hidden = true;
    $('#dashboard').hidden = false;
  } catch (err) {
    showError(err.message);
  }
});

// Refresh & Logout
$('#refresh').addEventListener('click', () => refresh().catch(e => alert(e.message)));
$('#logout').addEventListener('click', () => {
  secret = '';
  $('#secret').value = '';
  $('#adminAuth').hidden = false;
  $('#dashboard').hidden = true;
  showError('');
});

// Tab Switcher
$('#tabChartsBtn').addEventListener('click', () => {
  $('#tabChartsBtn').classList.add('active');
  $('#tabListBtn').classList.remove('active');
  $('#tabChartsView').hidden = false;
  $('#tabListView').hidden = true;
});

$('#tabListBtn').addEventListener('click', () => {
  $('#tabListBtn').classList.add('active');
  $('#tabChartsBtn').classList.remove('active');
  $('#tabChartsView').hidden = true;
  $('#tabListView').hidden = false;
});

// Filter events
$('#tableSearch').addEventListener('input', applyFilter);
$('#levelFilter').addEventListener('change', applyFilter);

// Modal Close events
$('#modalCloseBtn').addEventListener('click', closeModal);
$('#detailModal').addEventListener('click', e => {
  if (e.target === $('#detailModal')) closeModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#detailModal').hidden) closeModal();
});

// Export Buttons
document.querySelectorAll('[data-export]').forEach(btn => btn.addEventListener('click', async () => {
  try {
    const ext = btn.dataset.export;
    const response = await authFetch('/api/admin/export.' + ext);
    const url = URL.createObjectURL(await response.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ez-elearning-khao-sat.' + ext;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    alert(e.message);
  }
}));
