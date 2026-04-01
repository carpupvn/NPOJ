// ========== KHỞI TẠO BIẾN TOÀN CỤC ==========
let problems = [];
let activeProb = null;
let currentCode = null;      // Mã lớp học (ví dụ: "001")
let currentProblemId = null; // Lưu ID bài đang mở để quản lý code tạm

// ========== 1. QUẢN LÝ TRUY CẬP THEO MÃ ==========
async function accessByCode(forcedCode = null) {
    const codeInput = document.getElementById('exercise-code');
    const code = forcedCode || codeInput.value.trim();
    const loader = document.getElementById('loader');
    const errorDiv = document.getElementById('start-error');

    if (!code) {
        alert("Vui lòng nhập mã số bài tập!");
        return;
    }

    if (loader) loader.style.display = 'block';
    if (errorDiv) errorDiv.style.display = 'none';

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

        // Lưu vào URL
        const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + `?ma=${code}`;
        window.history.pushState({ path: newUrl }, '', newUrl);

        document.getElementById('display-ma').innerText = code;
        switchView('user');
    } catch (e) {
        if (errorDiv) {
            errorDiv.style.display = 'block';
            errorDiv.innerText = e.message;
        } else {
            alert(e.message);
        }
        logout(false);
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

function logout(resetUrl = true) {
    if (resetUrl) {
        const baseUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
        window.history.pushState({ path: baseUrl }, '', baseUrl);
    }
    problems = [];
    currentCode = null;
    currentProblemId = null;

    document.getElementById('app-content').classList.add('hidden');
    const viewStart = document.getElementById('view-start');
    viewStart.style.display = 'flex';
    viewStart.classList.add('active');
    document.getElementById('exercise-code').value = '';
    const errorDiv = document.getElementById('start-error');
    if (errorDiv) errorDiv.style.display = 'none';
}

// ========== 2. QUẢN LÝ GIAO DIỆN ==========
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

// ========== 3. HIỂN THỊ BÀI TẬP ==========
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
    // Lưu code của bài trước đó nếu có
    if (activeProb && currentProblemId) {
        saveCurrentCodeToLocal();
    }

    activeProb = problems.find(p => String(p.id) === String(id));
    if (!activeProb) return;

    currentProblemId = activeProb.id;
    document.getElementById('solve-title').innerText = activeProb.title;
    document.getElementById('solve-desc').innerText = activeProb.desc;
    document.getElementById('lang-tag').innerText = activeProb.lang.toUpperCase();
    document.getElementById('terminal').innerHTML = '';
    const status = document.getElementById('judge-status');
    status.innerText = "Sẵn sàng.";
    status.style.color = "#94a3b8";

    // Khôi phục code đã lưu (nếu có)
    const saved = localStorage.getItem(`code_${currentCode}_${activeProb.id}`);
    const editor = document.getElementById('code-editor');
    editor.value = saved !== null ? saved : '';
    updateHighlighting();

    switchView('solve');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function saveCurrentCodeToLocal() {
    if (currentCode && currentProblemId) {
        const editor = document.getElementById('code-editor');
        if (editor) {
            localStorage.setItem(`code_${currentCode}_${currentProblemId}`, editor.value);
        }
    }
}

// ========== 4. CHẤM BÀI VỚI PISTON (CẢI TIẾN HIỂN THỊ TERMINAL) ==========
function compareOutputs(received, expected) {
    const recStr = received.trim();
    const expStr = expected.trim();
    if (recStr === expStr) return true;
    const recNum = parseFloat(recStr);
    const expNum = parseFloat(expStr);
    if (!isNaN(recNum) && !isNaN(expNum)) {
        return Math.abs(recNum - expNum) <= 0.0001;
    }
    return false;
}

async function runCode() {
    if (!activeProb) return;
    saveCurrentCodeToLocal();

    const code = document.getElementById('code-editor').value;
    const statusDiv = document.getElementById('judge-status');
    const term = document.getElementById('terminal');

    // Clear terminal và thêm header
    term.innerHTML = `<div style="color:#60a5fa; margin-bottom:12px;">🚀 Bắt đầu chấm bài...</div>`;

    // Disable nút nộp bài để tránh spam
    const submitBtn = document.querySelector('#view-solve .btn-success');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add('loading');
        submitBtn.innerText = 'ĐANG CHẤM...';
    }

    statusDiv.innerText = "ĐANG CHẤM...";
    statusDiv.style.color = "#fbbf24";

    let earnedPoints = 0;
    let testResults = [];

    for (let i = 0; i < activeProb.tests.length; i++) {
        const test = activeProb.tests[i];
        const testDiv = document.createElement('div');
        testDiv.className = 'test-row';
        testDiv.id = `test-${i}`;
        term.appendChild(testDiv);

        // Header của test
        const headerDiv = document.createElement('div');
        headerDiv.className = 'test-header';
        headerDiv.innerHTML = `Test ${i+1} <span style="color:#aaa;">(Điểm: ${test.point})</span>`;
        testDiv.appendChild(headerDiv);

        const statusSpan = document.createElement('span');
        statusSpan.className = 'test-status';
        headerDiv.appendChild(statusSpan);

        const detailDiv = document.createElement('div');
        detailDiv.className = 'test-detail';
        testDiv.appendChild(detailDiv);

        // Cập nhật trạng thái "Đang chạy..."
        statusSpan.innerHTML = '⏳ Đang chạy...';
        statusSpan.style.color = '#fbbf24';

        try {
            const response = await fetch("https://emkc.org/api/v2/piston/execute", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    language: activeProb.lang === "cpp" ? "cpp" : "python",
                    version: activeProb.lang === "cpp" ? "10.2.0" : "3.10.0",
                    files: [{ content: code }],
                    stdin: test.input
                })
            });

            const result = await response.json();
            const output = (result.run?.output || "").trim();
            const stderr = result.run?.stderr || "";

            if (stderr) {
                statusSpan.innerHTML = '❌ RUNTIME ERROR';
                statusSpan.style.color = '#ef4444';
                detailDiv.innerHTML = `<span style="color:#ef4444;">Lỗi thực thi:</span> ${escapeHtml(stderr.split('\n')[0])}`;
                testResults.push({ status: 'ERR', point: 0 });
            } else if (compareOutputs(output, test.output)) {
                const p = parseInt(test.point) || 0;
                earnedPoints += p;
                statusSpan.innerHTML = `✅ ĐÚNG (+${p}đ)`;
                statusSpan.style.color = '#4ade80';
                detailDiv.innerHTML = `<span style="color:#4ade80;">Output của bạn:</span> ${escapeHtml(output)}`;
                testResults.push({ status: 'AC', point: p });
            } else {
                statusSpan.innerHTML = '❌ SAI';
                statusSpan.style.color = '#f43f5e';
                detailDiv.innerHTML = `
                    <span style="color:#fbbf24;">Kỳ vọng:</span> ${escapeHtml(test.output)}<br>
                    <span style="color:#fbbf24;">Nhận được:</span> ${escapeHtml(output)}
                `;
                testResults.push({ status: 'WA', point: 0 });
            }
        } catch (e) {
            statusSpan.innerHTML = '⚠️ LỖI KẾT NỐI';
            statusSpan.style.color = '#ef4444';
            detailDiv.innerHTML = `Không thể kết nối đến máy chủ chấm.`;
            testResults.push({ status: 'ERR', point: 0 });
        }

        // Cuộn xuống cuối terminal
        term.scrollTop = term.scrollHeight;
        await new Promise(r => setTimeout(r, 30));
    }

    // Tổng kết
    const totalDiv = document.createElement('div');
    totalDiv.style.marginTop = '15px';
    totalDiv.style.paddingTop = '10px';
    totalDiv.style.borderTop = '1px solid #334155';
    totalDiv.style.fontWeight = 'bold';
    totalDiv.innerHTML = `📊 Tổng điểm: ${earnedPoints}/100`;
    term.appendChild(totalDiv);

    statusDiv.innerText = `KẾT QUẢ: ${earnedPoints}/100 ĐIỂM`;
    statusDiv.style.color = earnedPoints >= 100 ? "#10b981" : "#fbbf24";

    if (earnedPoints >= 100) showCongrats();

    // Re-enable nút nộp bài
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('loading');
        submitBtn.innerText = 'NỘP BÀI';
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ========== 5. EDITOR & HIGHLIGHT ==========
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

    // Backspace thông minh (xóa 4 khoảng trắng)
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

    // Tab → 4 spaces
    if (e.key === 'Tab') {
        e.preventDefault();
        editor.value = v.substring(0, s) + "    " + v.substring(editor.selectionEnd);
        editor.selectionStart = editor.selectionEnd = s + 4;
        updateHighlighting();
        return;
    }

    // Tự động đóng ngoặc
    const pairs = { '{': '}', '(': ')', '[': ']', '"': '"', "'": "'" };
    if (pairs[e.key]) {
        e.preventDefault();
        const close = pairs[e.key];
        editor.value = v.substring(0, s) + e.key + close + v.substring(editor.selectionEnd);
        editor.selectionStart = editor.selectionEnd = s + 1;
        updateHighlighting();
        return;
    }

    // Xử lý Enter (indent thông minh)
    if (e.key === 'Enter') {
        e.preventDefault();
        const lines = v.substring(0, s).split('\n');
        const lastLine = lines[lines.length - 1];
        const indentMatch = lastLine.match(/^[ ]*/);
        const indent = indentMatch ? indentMatch[0] : "";
        let extraIndent = "";
        if (activeProb?.lang === 'python' && lastLine.trim().endsWith(':')) {
            extraIndent = "    ";
        } else if (activeProb?.lang === 'cpp' && lastLine.trim().endsWith('{')) {
            extraIndent = "    ";
        }

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
    const btns = document.querySelectorAll('button');
    btns.forEach(btn => {
        btn.onmouseover = () => btn.style.transform = "translateY(-2px)";
        btn.onmouseout = () => btn.style.transform = "translateY(0)";
    });
}

// ========== 6. QUẢN TRỊ VIÊN ==========
function authAdmin() {
    if (prompt("Mã bảo mật:") === "05122010") {
        renderAdminProblems();
        switchView('admin');
    }
}

function renderAdminProblems() {
    const container = document.getElementById('admin-list');
    if (!container) return;

    if (problems.length === 0) {
        container.innerHTML = "<p style='color:#94a3b8;'>Chưa có bài tập nào. Hãy tạo mới hoặc import JSON.</p>";
    } else {
        container.innerHTML = problems.map(p => `
            <div class="card" style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <strong>${escapeHtml(p.title)}</strong> (${p.lang}) - ${p.tests.length} test
                </div>
                <div>
                    <button class="btn-outline" onclick="editProblem('${p.id}')">Sửa</button>
                    <button class="btn-danger" onclick="deleteProblem('${p.id}')">Xóa</button>
                </div>
            </div>
        `).join('');
    }
}

function deleteProblem(id) {
    if (confirm("Xóa bài tập này?")) {
        problems = problems.filter(p => String(p.id) !== String(id));
        renderAdminProblems();
        renderUserProblems();
    }
}

function editProblem(id) {
    const prob = problems.find(p => String(p.id) === String(id));
    if (!prob) return;
    document.getElementById('adm-title').value = prob.title;
    document.getElementById('adm-desc').value = prob.desc;
    document.getElementById('adm-lang').value = prob.lang;

    const testContainer = document.getElementById('test-container');
    testContainer.innerHTML = '';
    prob.tests.forEach((t, idx) => {
        addTestUI(t.input, t.output, t.point);
    });
    window.editingProblemId = prob.id;
    switchView('editor');
}

function openEditor() {
    document.getElementById('adm-title').value = '';
    document.getElementById('adm-desc').value = '';
    document.getElementById('adm-lang').value = 'python';
    document.getElementById('test-container').innerHTML = '';
    window.editingProblemId = null;
    switchView('editor');
}

function addTestUI(input = '', output = '', point = 10) {
    const container = document.getElementById('test-container');
    const div = document.createElement('div');
    div.className = 'testcase-row';
    div.innerHTML = `
        <textarea placeholder="Input" rows="2" class="input-modern test-input">${escapeHtml(input)}</textarea>
        <textarea placeholder="Output" rows="2" class="input-modern test-output">${escapeHtml(output)}</textarea>
        <input type="number" placeholder="Điểm" value="${point}" class="input-modern test-point" style="width:80px">
        <button class="btn-danger" onclick="this.parentElement.remove()">Xóa</button>
    `;
    container.appendChild(div);
}

function saveProblem() {
    const title = document.getElementById('adm-title').value.trim();
    const desc = document.getElementById('adm-desc').value.trim();
    const lang = document.getElementById('adm-lang').value;

    if (!title || !desc) {
        alert("Vui lòng điền đầy đủ tên và mô tả bài tập");
        return;
    }

    const testDivs = document.querySelectorAll('#test-container .testcase-row');
    const tests = [];
    for (let div of testDivs) {
        const input = div.querySelector('.test-input').value;
        const output = div.querySelector('.test-output').value;
        const point = parseInt(div.querySelector('.test-point').value) || 0;
        tests.push({ input, output, point });
    }

    if (tests.length === 0) {
        alert("Cần ít nhất một test case");
        return;
    }

    const newId = window.editingProblemId || Date.now().toString();
    const problem = {
        id: newId,
        title,
        desc,
        lang,
        tests
    };

    if (window.editingProblemId) {
        const index = problems.findIndex(p => String(p.id) === String(window.editingProblemId));
        if (index !== -1) problems[index] = problem;
    } else {
        problems.push(problem);
    }

    // Xuất JSON
    const dataStr = JSON.stringify(problem, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);

    alert("Bài tập đã được lưu và xuất file JSON. Hãy đặt file này vào thư mục data/[mã]/ và cập nhật list.json");
    switchView('admin');
    renderAdminProblems();
    renderUserProblems();
}

function importProblemsFromJSON(files) {
    for (let file of files) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const prob = JSON.parse(e.target.result);
                if (prob.id && prob.title && prob.desc && prob.lang && prob.tests) {
                    const idx = problems.findIndex(p => String(p.id) === String(prob.id));
                    if (idx !== -1) problems[idx] = prob;
                    else problems.push(prob);
                } else {
                    alert("File JSON không đúng cấu trúc bài tập");
                }
                renderAdminProblems();
                renderUserProblems();
            } catch (err) {
                alert("Lỗi đọc file JSON");
            }
        };
        reader.readAsText(file);
    }
}

// ========== 7. HIỆU ỨNG PHÁO HOA & MODAL ==========
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
            ], {
                duration: 1000 + Math.random() * 1000,
                easing: 'ease-out',
                fill: 'forwards'
            });
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

// ========== 8. KHỞI TẠO & SỰ KIỆN ==========
window.onload = () => {
    // Xử lý mã từ URL
    const urlParams = new URLSearchParams(window.location.search);
    const savedCode = urlParams.get('ma');
    if (savedCode) accessByCode(savedCode);

    // Enter để vào bài tập
    const codeInput = document.getElementById('exercise-code');
    if (codeInput) {
        codeInput.onkeyup = (e) => { if (e.key === 'Enter') accessByCode(); };
    }

    // Đồng bộ cuộn editor
    const ed = document.getElementById('code-editor');
    const hlLayer = document.getElementById('highlighting-layer');
    if (ed && hlLayer) {
        ed.onkeydown = handleEditorKeys;
        ed.oninput = updateHighlighting;
        ed.onscroll = () => {
            hlLayer.scrollTop = ed.scrollTop;
            hlLayer.scrollLeft = ed.scrollLeft;
        };
    }

    // Thêm nút import JSON vào thanh admin
    const adminHeader = document.querySelector('#view-admin > div:first-child');
    if (adminHeader) {
        const importBtn = document.createElement('button');
        importBtn.className = 'btn-outline';
        importBtn.innerText = '📂 Import JSON';
        importBtn.onclick = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'application/json';
            input.multiple = true;
            input.onchange = (e) => importProblemsFromJSON(e.target.files);
            input.click();
        };
        adminHeader.appendChild(importBtn);
    }

    applyButtonEffects();
};