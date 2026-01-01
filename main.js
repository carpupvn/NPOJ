let problems = [];
let activeProb = null;
let currentCode = null;

// ==========================================
// 1. HỆ THỐNG TRUY CẬP & ĐỒNG BỘ DỮ LIỆU
// ==========================================
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

// ==========================================
// 2. QUẢN LÝ GIAO DIỆN (VIEW SYSTEM)
// ==========================================
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

// ==========================================
// 3. LOGIC NGƯỜI DÙNG (USER)
// ==========================================
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
            <h3 style="margin:10px 0">${p.title}</h3>
            <p style="color:#94a3b8; font-size:13px; line-height:1.5; margin-bottom:0">
                ${p.desc.substring(0, 100)}${p.desc.length > 100 ? '...' : ''}
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

// ==========================================
// 4. ENGINE CHẤM BÀI (JUDGE)
// ==========================================
function compareOutputs(received, expected) {
    const recStr = received.trim().replace(/\r/g, "");
    const expStr = expected.trim().replace(/\r/g, "");
    if (recStr === expStr) return true;
    const recNum = parseFloat(recStr);
    const expNum = parseFloat(expStr);
    if (!isNaN(recNum) && !isNaN(expNum)) {
        return Math.abs(recNum - expNum) <= 0.0001;
    }
    return false;
}

async function runCode() {
    const code = document.getElementById('code-editor').value;
    const status = document.getElementById('judge-status');
    const term = document.getElementById('terminal');
    if (!activeProb) return;
    
    term.innerHTML = `<span style="color:#60a5fa">>> Đang khởi tạo...</span>\n`;
    status.innerText = "ĐANG CHẤM...";
    status.style.color = "#60a5fa";

    let earnedPoints = 0;

    for (let i = 0; i < activeProb.tests.length; i++) {
        const test = activeProb.tests[i];
        try {
            const response = await fetch("https://emkc.org/api/v2/piston/execute", {
                method: "POST",
                body: JSON.stringify({
                    language: activeProb.lang === "cpp" ? "cpp" : "python",
                    version: activeProb.lang === "cpp" ? "10.2.0" : "3.10.0",
                    files: [{ content: code }],
                    stdin: test.input
                })
            });
            const result = await response.json();
            const output = (result.run?.output || "").trim();

            if (compareOutputs(output, test.output)) {
                const p = parseInt(test.point) || 0;
                earnedPoints += p;
                term.innerHTML += `<span style="color:#4ade80">Test ${i+1}: ĐÚNG (+${p}đ)</span>\n`;
            } else {
                term.innerHTML += `<span style="color:#f43f5e">Test ${i+1}: SAI</span>\n`;
            }
        } catch (e) { 
            term.innerHTML += `Lỗi kết nối bộ chấm\n`; 
        }
        term.scrollTop = term.scrollHeight;
    }
    
    status.innerText = `KẾT QUẢ: ${earnedPoints}/100 ĐIỂM`;
    status.style.color = earnedPoints >= 100 ? "#10b981" : "#f59e0b";

    if (earnedPoints >= 100) {
        showCongrats();
    }
}

// ==========================================
// 5. EDITOR & HIỆU ỨNG THÔNG MINH
// ==========================================
function updateHighlighting() {
    const editor = document.getElementById('code-editor');
    const display = document.getElementById('highlighting-content');
    if (editor && display) {
        let lang = (activeProb && activeProb.lang === 'cpp') ? 'cpp' : 'python';
        display.className = `language-${lang}`;
        display.textContent = editor.value + (editor.value.endsWith("\n") ? " " : ""); 
        if (window.Prism) Prism.highlightElement(display);
    }
}

function handleEditorKeys(e) {
    const editor = e.target;
    const s = editor.selectionStart;
    const v = editor.value;

    if (e.key === 'Tab') {
        e.preventDefault();
        editor.value = v.substring(0, s) + "    " + v.substring(editor.selectionEnd);
        editor.selectionStart = editor.selectionEnd = s + 4;
        updateHighlighting();
    }
    
    if (e.key === 'Backspace') {
        const textBefore = v.substring(0, s);
        if (textBefore.endsWith('    ')) {
            e.preventDefault();
            editor.value = v.substring(0, s - 4) + v.substring(s);
            editor.selectionStart = editor.selectionEnd = s - 4;
            updateHighlighting();
        }
    }

    const pairs = { '{': '}', '(': ')', '[': ']', '"': '"', "'": "'" };
    if (pairs[e.key]) {
        e.preventDefault();
        const close = pairs[e.key];
        editor.value = v.substring(0, s) + e.key + close + v.substring(editor.selectionEnd);
        editor.selectionStart = editor.selectionEnd = s + 1;
        updateHighlighting();
    }

    if (e.key === 'Enter') {
        const lines = v.substring(0, s).split('\n');
        const lastLine = lines[lines.length - 1];
        const indent = lastLine.match(/^\s*/)[0];
        const charBefore = v[s - 1];
        const charAfter = v[s];

        if (charBefore === '{' && charAfter === '}') {
            e.preventDefault();
            editor.value = v.substring(0, s) + "\n" + indent + "    \n" + indent + v.substring(s);
            editor.selectionStart = editor.selectionEnd = s + indent.length + 5;
            updateHighlighting();
        } else {
            e.preventDefault();
            let extraIndent = "";
            if (activeProb?.lang === 'python' && lastLine.trim().endsWith(':')) extraIndent = "    ";
            if (activeProb?.lang === 'cpp' && lastLine.trim().endsWith('{')) extraIndent = "    ";
            
            editor.value = v.substring(0, s) + "\n" + indent + extraIndent + v.substring(editor.selectionEnd);
            editor.selectionStart = editor.selectionEnd = s + 1 + indent.length + extraIndent.length;
            updateHighlighting();
        }
    }
}

// ==========================================
// 6. LOGIC QUẢN TRỊ (ADMIN - ĐẦY ĐỦ)
// ==========================================
function renderAdminProblems() {
    const list = document.getElementById('admin-prob-list');
    if (!list) return;
    list.innerHTML = `
        <div class="card" style="grid-column: 1/-1; background: rgba(16, 185, 129, 0.1); border: 1px dashed var(--success); text-align: center; cursor: pointer;" onclick="createNewProblem()">
            <h3 style="color: var(--success);">+ Thêm Bài Tập Mới</h3>
        </div>
    ` + problems.map(p => `
        <div class="card" style="display:flex; justify-content:space-between; align-items:center; padding:20px">
            <div>
                <div style="font-size:12px; color:var(--primary); font-weight:bold;">ID: ${p.id}</div>
                <h3 style="margin:5px 0">${p.title}</h3>
                <small style="color:var(--text-muted)">Ngôn ngữ: ${p.lang.toUpperCase()} | Testcases: ${p.tests.length}</small>
            </div>
            <div style="display:flex; gap:10px">
                <button class="btn-outline" onclick="copyProblemJSON('${p.id}')">Copy JSON</button>
                <button class="btn-outline" onclick="editProblem('${p.id}')">Sửa</button>
                <button class="btn-outline" onclick="deleteProblem('${p.id}')" style="color:var(--danger)">Xóa</button>
            </div>
        </div>
    `).join('');
}

function createNewProblem() {
    const id = Date.now();
    const newProb = {
        id: id,
        title: "Bài tập mới",
        lang: "python",
        desc: "Mô tả đề bài tại đây...",
        tests: [{ input: "1", output: "1", point: "100" }]
    };
    problems.push(newProb);
    renderAdminProblems();
    editProblem(id);
}

function editProblem(id) {
    const p = problems.find(x => String(x.id) === String(id));
    if (!p) return;

    const newTitle = prompt("Tên bài tập:", p.title);
    if (newTitle === null) return;
    
    const newLang = prompt("Ngôn ngữ (python/cpp):", p.lang);
    const newDesc = prompt("Mô tả bài tập:", p.desc);
    
    p.title = newTitle;
    p.lang = newLang || p.lang;
    p.desc = newDesc || p.desc;

    // Quản lý Testcase động
    if (confirm("Bạn có muốn chỉnh sửa Testcases không?")) {
        const testCount = prompt("Số lượng Testcases:", p.tests.length);
        if (testCount !== null) {
            p.tests = [];
            for (let i = 0; i < parseInt(testCount); i++) {
                const inp = prompt(`Test ${i+1} - Input:`, "");
                const out = prompt(`Test ${i+1} - Output:`, "");
                const pt = prompt(`Test ${i+1} - Điểm:`, "20");
                p.tests.push({ input: inp, output: out, point: pt });
            }
        }
    }
    
    renderAdminProblems();
    alert("Đã cập nhật tạm thời. Hãy copy JSON để lưu vào file!");
}

function deleteProblem(id) {
    if (confirm("Xóa bài tập này?")) {
        problems = problems.filter(p => String(p.id) !== String(id));
        renderAdminProblems();
    }
}

function copyProblemJSON(id) {
    const p = problems.find(x => String(x.id) === String(id));
    const json = JSON.stringify(p, null, 4);
    navigator.clipboard.writeText(json);
    alert("Đã copy JSON của bài tập " + p.title + " vào ClipBoard!");
}

// ==========================================
// 7. HIỆU ỨNG PHÁO HOA & KHỞI TẠO
// ==========================================
function launchFireworks() {
    const colors = ['#ff0', '#f0f', '#0ff', '#0f0', '#fff', '#ff4500'];
    for (let i = 0; i < 60; i++) {
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
            const destX = x + (Math.random() - 0.5) * 300;
            const destY = Math.random() * (window.innerHeight * 0.4);
            particle.animate([
                { transform: `translate(0, 0)`, opacity: 1 },
                { transform: `translate(${destX - x}px, ${destY - y}px)`, opacity: 0 }
            ], { duration: 2000, easing: 'ease-out', fill: 'forwards' });
            setTimeout(() => particle.remove(), 2100);
        }, i * 80);
    }
}

function showCongrats() {
    const modal = document.getElementById('congrats-modal');
    if (modal) {
        modal.classList.add('active');
        launchFireworks();
        setTimeout(() => { modal.classList.remove('active'); }, 6000);
    }
}

function applyButtonEffects() {
    document.querySelectorAll('button').forEach(btn => {
        btn.onmouseover = () => btn.style.transform = "translateY(-2px)";
        btn.onmouseout = () => btn.style.transform = "translateY(0)";
    });
}

window.onload = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const ma = urlParams.get('ma');
    if (ma) accessByCode(ma);

    const codeInput = document.getElementById('exercise-code');
    if (codeInput) {
        codeInput.onkeyup = (e) => { if (e.key === 'Enter') accessByCode(); };
    }

    const ed = document.getElementById('code-editor');
    const highlightingLayer = document.getElementById('highlighting-layer');

    if (ed) {
        ed.onkeydown = handleEditorKeys;
        ed.oninput = updateHighlighting;
        
        // ĐỒNG BỘ CUỘN: Quan trọng để không bị ghosting khi code dài
        ed.addEventListener('scroll', () => {
            if (highlightingLayer) {
                highlightingLayer.scrollTop = ed.scrollTop;
                highlightingLayer.scrollLeft = ed.scrollLeft;
            }
        });
    }
    applyButtonEffects(); 
};

// Cập nhật hàm này để xử lý ký tự trống ở cuối dòng
function updateHighlighting() {
    const editor = document.getElementById('code-editor');
    const display = document.getElementById('highlighting-content');
    if (editor && display) {
        let lang = (activeProb && activeProb.lang === 'cpp') ? 'cpp' : 'python';
        display.className = `language-${lang}`;
        
        // Thêm một dấu cách nếu dòng cuối là xuống dòng để dấu nháy không bị nhảy lên trên
        let content = editor.value;
        if (content[content.length - 1] === "\n") {
            content += " ";
        }
        
        display.textContent = content; 
        if (window.Prism) Prism.highlightElement(display);
    }
}

function authAdmin() {
    if (prompt("Mã bảo mật hệ thống:") === "05122010") switchView('admin');
}