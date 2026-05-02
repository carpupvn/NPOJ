// ================================
// NPOJ - CHẤM BÀI QUA JDOODLE PROXY (CLOUDFLARE WORKER)
// ================================

const WORKER_URL = 'https://npoj-free.npngocphuoc.workers.dev'; // URL worker của bạn

let problems = [];
let activeProb = null;
let currentCode = null;
let editingProblemId = null;

// ================================
// 1. TRUY CẬP MÃ BÀI TẬP
// ================================
async function accessByCode(forcedCode = null) {
    const codeInput = document.getElementById('exercise-code');
    const code = forcedCode || codeInput.value.trim();
    const loader = document.getElementById('loader');

    if (!code) {
        alert("Vui lòng nhập mã số bài tập!");
        return;
    }
    if (loader) loader.style.display = 'block';
    try {
        const v = Date.now();
        const response = await fetch(`data/${code}/list.json?v=${v}`);
        if (!response.ok) throw new Error("Mã bài tập không tồn tại!");
        const fileConfigs = await response.json();
        const promises = fileConfigs.map(item => 
            fetch(`data/${code}/${encodeURIComponent(item.filename)}.json?v=${v}`)
                .then(res => res.ok ? res.json() : null)
        );
        const results = await Promise.all(promises);
        problems = results.filter(p => p !== null);
        currentCode = code;

        const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + `?ma=${code}`;
        window.history.pushState({ path: newUrl }, '', newUrl);
        document.getElementById('display-ma').innerText = code;
        switchView('user');
    } catch (e) {
        alert(e.message);
        logout();
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

function logout() {
    const baseUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
    window.history.pushState({ path: baseUrl }, '', baseUrl);
    problems = [];
    currentCode = null;
    document.getElementById('app-content').classList.add('hidden');
    const viewStart = document.getElementById('view-start');
    viewStart.style.display = 'flex';
    viewStart.classList.add('active');
    document.getElementById('exercise-code').value = '';
}

// ================================
// 2. QUẢN LÝ VIEW
// ================================
function switchView(v) {
    const allViews = document.querySelectorAll('.view');
    const viewStart = document.getElementById('view-start');
    const appContent = document.getElementById('app-content');

    allViews.forEach(view => {
        view.classList.remove('active');
        view.style.display = 'none';
    });

    if (v === 'start') {
        appContent.classList.add('hidden');
        viewStart.style.display = 'flex';
        setTimeout(() => viewStart.classList.add('active'), 10);
    } else {
        viewStart.style.display = 'none';
        viewStart.classList.remove('active');
        appContent.classList.remove('hidden');
        const target = document.getElementById('view-' + v);
        if (target) {
            target.style.display = 'block';
            setTimeout(() => target.classList.add('active'), 10);
        }
    }

    if (v === 'user') renderUserProblems();
    if (v === 'admin') renderAdminProblems();
    applyButtonEffects();
}

// ================================
// 3. HIỂN THỊ BÀI TẬP (USER)
// ================================
function renderUserProblems() {
    const grid = document.getElementById('prob-grid');
    if (!grid) return;
    if (problems.length === 0) {
        grid.innerHTML = "<p style='color:#94a3b8; grid-column:1/-1; text-align:center;'>Folder này chưa có bài tập nào.</p>";
        return;
    }
    grid.innerHTML = problems.map(p => `
        <div class="card problem-card" onclick="openSolve('${p.id}')">
            <div class="prob-status" style="background: ${p.lang === 'cpp' ? '#3b82f6' : '#eab308'}">
                ${p.lang.toUpperCase()}
            </div>
            <h3 style="margin:10px 0">${escapeHtml(p.title)}</h3>
            <p style="color:#94a3b8; font-size:13px; line-height:1.5; margin-bottom:0">
                ${escapeHtml(p.desc.substring(0, 100))}${p.desc.length > 100 ? '...' : ''}
            </p>
        </div>
    `).join('');
}

function openSolve(id) {
    activeProb = problems.find(p => String(p.id) === String(id));
    if (!activeProb) return;

    document.getElementById('solve-title').innerText = activeProb.title;
    document.getElementById('solve-desc').innerText = activeProb.desc;
    document.getElementById('lang-tag').innerText = activeProb.lang.toUpperCase();
    document.getElementById('terminal').innerHTML = '';
    document.getElementById('code-editor').value = '';
    const status = document.getElementById('judge-status');
    status.innerText = "Sẵn sàng.";
    status.style.color = "#94a3b8";
    updateHighlighting();
    switchView('solve');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ================================
// 4. SO SÁNH KẾT QUẢ
// ================================
function compareOutputs(received, expected) {
    const recStr = received.trim().replace(/\r/g, '');
    const expStr = expected.trim().replace(/\r/g, '');
    if (recStr === expStr) return true;
    const recNum = parseFloat(recStr);
    const expNum = parseFloat(expStr);
    if (!isNaN(recNum) && !isNaN(expNum)) {
        return Math.abs(recNum - expNum) <= 0.0001;
    }
    return false;
}

// ================================
// 5. CHẤM BÀI QUA JDOODLE PROXY
// ================================
async function runCode() {
    const code = document.getElementById('code-editor').value;
    const status = document.getElementById('judge-status');
    const term = document.getElementById('terminal');
    if (!activeProb) return;

    term.innerHTML = '<div style="color:#60a5fa">⏳ Đang kết nối máy chủ chấm bài (JDoodle)...</div>';
    status.innerText = "ĐANG CHẤM...";
    status.style.color = "#fbbf24";

    let earnedPoints = 0;

    for (let i = 0; i < activeProb.tests.length; i++) {
        const test = activeProb.tests[i];
        const testDiv = document.createElement('div');
        testDiv.style.marginBottom = '12px';
        testDiv.style.borderLeft = '3px solid #334155';
        testDiv.style.paddingLeft = '10px';

        try {
            const response = await fetch(WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    language: activeProb.lang,
                    code: code,
                    stdin: test.input
                })
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const result = await response.json();
            const output = (result.output || "").trim();
            const error = result.error || "";

            if (error) {
                testDiv.innerHTML = `<span style="color:#ef4444">❌ Test ${i+1}: LỖI JDoodle</span><pre style="color:#ff8888; font-size:12px; margin-top:5px;">${escapeHtml(error)}</pre>`;
            } else if (compareOutputs(output, test.output)) {
                const p = parseInt(test.point) || 0;
                earnedPoints += p;
                testDiv.innerHTML = `<span style="color:#4ade80">✅ Test ${i+1}: ĐÚNG (+${p}đ)</span>`;
            } else {
                testDiv.innerHTML = `<span style="color:#f43f5e">❌ Test ${i+1}: SAI</span>
                    <div style="color:#94a3b8; font-size:12px; margin-top:5px;">
                        🔹 Kỳ vọng: ${escapeHtml(test.output)}<br>
                        🔸 Nhận được: ${escapeHtml(output)}
                    </div>`;
            }
        } catch (err) {
            testDiv.innerHTML = `<span style="color:#ef4444">💥 Test ${i+1}: LỖI KẾT NỐI - ${escapeHtml(err.message)}</span>`;
        }

        term.appendChild(testDiv);
        term.scrollTop = term.scrollHeight;
        await new Promise(r => setTimeout(r, 80));
    }

    status.innerText = `📊 KẾT QUẢ: ${earnedPoints}/100 ĐIỂM`;
    status.style.color = earnedPoints >= 100 ? "#10b981" : "#fbbf24";
    if (earnedPoints >= 100) showCongrats();
}

// ================================
// 6. EDITOR THÔNG MINH & QUẢN TRỊ (giữ nguyên từ bản cũ)
// ================================
function updateHighlighting() {
    const editor = document.getElementById('code-editor');
    const display = document.getElementById('highlighting-content');
    const hlLayer = document.getElementById('highlighting-layer');
    if (editor && display) {
        let lang = (activeProb && activeProb.lang === 'cpp') ? 'cpp' : 'python';
        display.className = `language-${lang}`;
        let content = editor.value;
        if (content.endsWith("\n")) content += " ";
        display.textContent = content;
        if (window.Prism) Prism.highlightElement(display);
        if (hlLayer) {
            hlLayer.scrollTop = editor.scrollTop;
            hlLayer.scrollLeft = editor.scrollLeft;
        }
    }
}

function handleEditorKeys(e) {
    const editor = e.target;
    const s = editor.selectionStart;
    const v = editor.value;

    if (e.key === 'Backspace' && s === editor.selectionEnd) {
        const lineStart = v.lastIndexOf('\n', s - 1) + 1;
        const textBeforeCursor = v.substring(lineStart, s);
        if (textBeforeCursor.length > 0 && textBeforeCursor.trim() === '' && textBeforeCursor.length % 4 === 0) {
            e.preventDefault();
            editor.value = v.substring(0, s - 4) + v.substring(s);
            editor.selectionStart = editor.selectionEnd = s - 4;
            updateHighlighting();
            return;
        }
    }

    if (e.key === 'Tab') {
        e.preventDefault();
        editor.value = v.substring(0, s) + "    " + v.substring(editor.selectionEnd);
        editor.selectionStart = editor.selectionEnd = s + 4;
        updateHighlighting();
        return;
    }

    const pairs = { '{': '}', '(': ')', '[': ']', '"': '"', "'": "'" };
    if (pairs[e.key]) {
        e.preventDefault();
        const close = pairs[e.key];
        editor.value = v.substring(0, s) + e.key + close + v.substring(editor.selectionEnd);
        editor.selectionStart = editor.selectionEnd = s + 1;
        updateHighlighting();
        return;
    }

    if (e.key === 'Enter') {
        e.preventDefault();
        const lines = v.substring(0, s).split('\n');
        const lastLine = lines[lines.length - 1];
        const indentMatch = lastLine.match(/^[ ]*/);
        const indent = indentMatch ? indentMatch[0] : "";
        let extraIndent = "";
        if (activeProb?.lang === 'python' && lastLine.trim().endsWith(':')) extraIndent = "    ";
        if (activeProb?.lang === 'cpp' && lastLine.trim().endsWith('{')) extraIndent = "    ";
        const charBefore = v[s - 1];
        const charAfter = v[s];
        if (charBefore === '{' && charAfter === '}') {
            editor.value = v.substring(0, s) + "\n" + indent + "    \n" + indent + v.substring(s);
            editor.selectionStart = editor.selectionEnd = s + indent.length + 5;
        } else {
            editor.value = v.substring(0, s) + "\n" + indent + extraIndent + v.substring(s);
            editor.selectionStart = editor.selectionEnd = s + 1 + indent.length + extraIndent.length;
        }
        updateHighlighting();
    }
}

function applyButtonEffects() {
    document.querySelectorAll('button').forEach(btn => {
        btn.onmouseover = () => btn.style.transform = "translateY(-2px)";
        btn.onmouseout = () => btn.style.transform = "translateY(0)";
    });
}

// ================================
// 7. QUẢN TRỊ (ADMIN) - DÙNG FORM
// ================================
function renderAdminProblems() {
    const container = document.getElementById('admin-list');
    if (!container) return;
    if (problems.length === 0) {
        container.innerHTML = '<div class="card" style="grid-column:1/-1; text-align:center;">Chưa có bài tập nào. Hãy tạo mới.</div>';
        return;
    }
    container.innerHTML = problems.map(p => `
        <div class="card" style="display:flex; justify-content:space-between; align-items:center; padding:20px">
            <div>
                <div style="font-size:12px; color:#3b82f6;">ID: ${p.id}</div>
                <h3 style="margin:5px 0">${escapeHtml(p.title)}</h3>
                <small style="color:#94a3b8">${p.lang.toUpperCase()} | ${p.tests.length} testcases</small>
            </div>
            <div style="display:flex; gap:10px">
                <button class="btn-outline" onclick="copyProblemJSON('${p.id}')">📋 Copy JSON</button>
                <button class="btn-outline" onclick="editProblemWithForm('${p.id}')">✏️ Sửa</button>
                <button class="btn-outline" onclick="deleteProblem('${p.id}')" style="color:#f43f5e">🗑 Xóa</button>
            </div>
        </div>
    `).join('');
}

function openEditor() {
    editingProblemId = null;
    document.getElementById('adm-title').value = '';
    document.getElementById('adm-desc').value = '';
    document.getElementById('adm-lang').value = 'python';
    document.getElementById('test-container').innerHTML = '';
    addTestUI();
    switchView('editor');
}

function editProblemWithForm(id) {
    const p = problems.find(x => String(x.id) === String(id));
    if (!p) return;
    editingProblemId = p.id;
    document.getElementById('adm-title').value = p.title;
    document.getElementById('adm-desc').value = p.desc;
    document.getElementById('adm-lang').value = p.lang;
    const container = document.getElementById('test-container');
    container.innerHTML = '';
    p.tests.forEach((test) => {
        addTestUI(test.input, test.output, test.point);
    });
    switchView('editor');
}

function addTestUI(inputVal = '', outputVal = '', pointVal = '') {
    const container = document.getElementById('test-container');
    const testDiv = document.createElement('div');
    testDiv.className = 'testcase-row';
    testDiv.innerHTML = `
        <input type="text" class="input-modern" placeholder="Input" value="${escapeHtml(String(inputVal))}">
        <input type="text" class="input-modern" placeholder="Output" value="${escapeHtml(String(outputVal))}">
        <input type="number" class="input-modern" placeholder="Điểm" value="${pointVal || '20'}">
        <button class="btn-outline" onclick="this.parentElement.remove()" style="grid-column:span 3; background:#f43f5e20">❌ Xóa test</button>
    `;
    container.appendChild(testDiv);
}

function saveProblem() {
    const title = document.getElementById('adm-title').value.trim();
    const desc = document.getElementById('adm-desc').value.trim();
    const lang = document.getElementById('adm-lang').value;
    const testDivs = document.querySelectorAll('#test-container .testcase-row');
    const tests = [];
    for (let div of testDivs) {
        const inputs = div.querySelectorAll('input');
        const inputVal = inputs[0].value.trim();
        const outputVal = inputs[1].value.trim();
        const pointVal = parseInt(inputs[2].value) || 0;
        if (inputVal !== '' && outputVal !== '') {
            tests.push({ input: inputVal, output: outputVal, point: pointVal });
        }
    }
    if (!title) {
        alert("Vui lòng nhập tên bài tập");
        return;
    }
    if (tests.length === 0) {
        alert("Cần ít nhất một test case");
        return;
    }

    if (editingProblemId === null) {
        const newId = Date.now();
        const newProb = {
            id: newId,
            title: title,
            desc: desc,
            lang: lang,
            tests: tests
        };
        problems.push(newProb);
        alert(`Đã tạo bài tập "${title}". Nhấn "Copy JSON" để lưu vào file.`);
    } else {
        const index = problems.findIndex(p => p.id === editingProblemId);
        if (index !== -1) {
            problems[index] = {
                ...problems[index],
                title: title,
                desc: desc,
                lang: lang,
                tests: tests
            };
            alert(`Đã cập nhật bài tập "${title}". Nhấn "Copy JSON" để lưu thay đổi.`);
        }
    }
    renderAdminProblems();
    switchView('admin');
}

function deleteProblem(id) {
    if (confirm("Xóa bài tập này vĩnh viễn?")) {
        problems = problems.filter(p => String(p.id) !== String(id));
        renderAdminProblems();
    }
}

function copyProblemJSON(id) {
    const p = problems.find(x => String(x.id) === String(id));
    if (!p) return;
    const json = JSON.stringify(p, null, 2);
    navigator.clipboard.writeText(json).then(() => {
        alert(`Đã copy JSON của "${p.title}" vào clipboard. Bạn có thể paste vào file .json và upload lên GitHub.`);
    }).catch(() => alert("Không thể copy, hãy thủ công sao chép."));
}

// ================================
// 8. PHÁO HOA & CHÚC MỪNG
// ================================
function launchFireworks() {
    const colors = ['#ff0', '#f0f', '#0ff', '#0f0', '#fff', '#ff4500'];
    for (let i = 0; i < 50; i++) {
        setTimeout(() => {
            const particle = document.createElement('div');
            particle.className = 'firework-particle';
            const x = Math.random() * window.innerWidth;
            const y = window.innerHeight;
            const color = colors[Math.floor(Math.random() * colors.length)];
            particle.style.left = x + 'px';
            particle.style.top = y + 'px';
            particle.style.backgroundColor = color;
            particle.style.boxShadow = `0 0 10px ${color}`;
            document.body.appendChild(particle);
            const destX = x + (Math.random() - 0.5) * 200;
            const destY = Math.random() * (window.innerHeight * 0.5);
            particle.animate([
                { transform: `translate(0, 0)`, opacity: 1 },
                { transform: `translate(${destX - x}px, ${destY - y}px)`, opacity: 0 }
            ], { duration: 1000 + Math.random() * 1000, easing: 'ease-out', fill: 'forwards' });
            setTimeout(() => particle.remove(), 2000);
        }, i * 100);
    }
}

function showCongrats() {
    const modal = document.getElementById('congrats-modal');
    modal.classList.add('active');
    launchFireworks();
    setTimeout(() => modal.classList.remove('active'), 5000);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    }).replace(/[\n\r]/g, '↵ ');
}

function authAdmin() {
    if (prompt("Mã bảo mật:") === "05122010") switchView('admin');
}

// ================================
// 9. KHỞI TẠO
// ================================
window.onload = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const savedCode = urlParams.get('ma');
    if (savedCode) accessByCode(savedCode);

    const codeInput = document.getElementById('exercise-code');
    if (codeInput) {
        codeInput.onkeyup = (e) => { if (e.key === 'Enter') accessByCode(); };
    }

    const ed = document.getElementById('code-editor');
    const hlLayer = document.getElementById('highlighting-layer');
    if (ed && hlLayer) {
        ed.onkeydown = handleEditorKeys;
        ed.oninput = updateHighlighting;
        ed.addEventListener('scroll', () => {
            hlLayer.scrollTop = ed.scrollTop;
            hlLayer.scrollLeft = ed.scrollLeft;
        });
    }
    applyButtonEffects();
};