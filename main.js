let problems = [];
let activeProb = null;
let currentCode = null;

// --- 1. QUẢN LÝ TRUY CẬP THEO MÃ (MỚI) ---
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
        // Truy cập vào folder mã số để lấy list.json
        const response = await fetch(`data/${code}/list.json?v=${v}`);
        
        if (!response.ok) throw new Error("Mã bài tập không tồn tại!");

        const fileConfigs = await response.json();
        
        // Tải chi tiết các file .json bài tập trong folder đó
        const promises = fileConfigs.map(item => 
            fetch(`data/${code}/${encodeURIComponent(item.filename)}.json?v=${v}`)
                .then(res => res.ok ? res.json() : null)
        );
        
        const results = await Promise.all(promises);
        problems = results.filter(p => p !== null);
        currentCode = code;

        // Lưu mã vào URL mà không load lại trang
        const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + `?ma=${code}`;
        window.history.pushState({ path: newUrl }, '', newUrl);

        // Hiển thị giao diện
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
    // Xóa tham số URL
    const baseUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
    window.history.pushState({ path: baseUrl }, '', baseUrl);
    
    problems = [];
    currentCode = null;
    
    // Reset giao diện về màn hình chào
    document.getElementById('app-content').classList.add('hidden');
    const viewStart = document.getElementById('view-start');
    viewStart.style.display = 'flex';
    viewStart.classList.add('active');
    
    document.getElementById('exercise-code').value = '';
}

// --- 2. QUẢN LÝ GIAO DIỆN ---
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

// --- 3. HIỂN THỊ BÀI TẬP ---
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

// --- 4. ENGINE CHẤM BÀI (GIỮ NGUYÊN LOGIC CỦA BẠN) ---
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
}

// --- 5. EDITOR & HIỆU ỨNG (GIỮ NGUYÊN) ---
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
}

function applyButtonEffects() {
    const btns = document.querySelectorAll('button');
    btns.forEach(btn => {
        btn.onmouseover = () => btn.style.transform = "translateY(-2px)";
        btn.onmouseout = () => btn.style.transform = "translateY(0)";
    });
}

// --- 6. KHỞI TẠO HỆ THỐNG ---
window.onload = () => {
    // Kiểm tra URL xem có mã cũ không
    const urlParams = new URLSearchParams(window.location.search);
    const savedCode = urlParams.get('ma');
    if (savedCode) {
        accessByCode(savedCode);
    }

    const ed = document.getElementById('code-editor');
    if(ed) {
        ed.onkeydown = handleEditorKeys;
        ed.oninput = updateHighlighting;
    }
    applyButtonEffects(); 
};

function authAdmin() {
    if (prompt("Mã bảo mật:") === "05122010") switchView('admin');
}