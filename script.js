let questions = [];
let currentQuestion = 0;
let score = 0;
let timer;
let timeLeft = 60;
let results = [];

// Sonidos
const audioCorrecto = new Audio('audio crrecto.mp3');
const audioIncorrecto = new Audio('incorrecto.mp3');
const audioFinalizar = new Audio('finalizar.mp3');

const startBtn = document.getElementById('start-btn');
const quizCard = document.getElementById('quiz-card');
const resultsDiv = document.getElementById('results');
const quizDetails = document.getElementById('quiz-details');
const darkModeBtn = document.getElementById('dark-mode-btn');
const logoutBtn = document.getElementById('logout-btn');
const rankingBtn = document.getElementById('ranking-btn');
const adminPanelBtn = document.getElementById('admin-panel-btn');
const adminPanelModal = document.getElementById('admin-panel-modal');
const closeAdminPanel = document.getElementById('close-admin-panel');
const adminUsersList = document.getElementById('admin-users-list');
const adminForceReset = document.getElementById('admin-force-reset');

// Mostrar botón solo si el usuario activo es admin (consultando backend)
async function updateAdminPanelBtn() {
    const usuarioActivo = localStorage.getItem('quiz-usuario-activo');
    if (!usuarioActivo) {
        adminPanelBtn.classList.add('hidden');
        return;
    }
    try {
        const res = await fetch(`${API_URL}/usuario/${encodeURIComponent(usuarioActivo)}/isadmin`);
        const data = await res.json();
        if (data.is_admin) {
            adminPanelBtn.classList.remove('hidden');
        } else {
            adminPanelBtn.classList.add('hidden');
        }
    } catch {
        adminPanelBtn.classList.add('hidden');
    }
}
window.addEventListener('DOMContentLoaded', updateAdminPanelBtn);

// Abrir panel admin
adminPanelBtn.onclick = function () {
    renderAdminUsers();
    adminPanelModal.classList.remove('hidden');
};
closeAdminPanel.onclick = function () {
    adminPanelModal.classList.add('hidden');
};

// --- PANEL DE ADMIN USANDO BACKEND ---
async function renderAdminUsers() {
    let users = await obtenerUsuarios();
    let html = '<table style="width:100%;border-collapse:collapse;">';
    html += '<tr><th>Usuario</th><th>Ranking</th><th>Logros</th><th>Eliminar</th></tr>';
    users.forEach(data => {
        const name = data.nombre;
        // Quitar la restricción para permitir eliminar admin y ronal
        html += `<tr>
            <td>${name}</td>
            <td>${data.ranking || 0}</td>
            <td>${data.logros ? data.logros : ''}</td>
            <td><button onclick="eliminarUsuarioAdminBackend('${name}')" style="padding:4px 10px;background:#dc3545;color:#fff;border:none;border-radius:4px;">Eliminar</button></td>
        </tr>`;
    });
    html += '</table>';
    adminUsersList.innerHTML = html;
}

// Eliminar usuario desde backend
window.eliminarUsuarioAdminBackend = async function (nombre) {
    if (!confirm('¿Seguro que quieres eliminar al usuario ' + nombre + '? Esta acción no se puede deshacer.')) return;
    await fetch(`${API_URL}/usuario/${nombre}`, { method: 'DELETE' });
    renderAdminUsers();
};

// Forzar reinicio de ranking desde el panel admin
adminForceReset.onclick = async function () {
    if (confirm('¿Seguro que quieres reiniciar el ranking y otorgar premios/logros a los top 3?')) {
        const res = await fetch(`${API_URL}/ranking-reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force: true })
        });
        if (res.ok) {
            alert('Ranking reiniciado y premios/logros otorgados.');
            checkAndResetRanking();
            renderAdminUsers();
            // Limpiar el último logro mostrado para forzar mostrar el nuevo premio
            localStorage.removeItem('quiz-premio-ultimo-logro');
            setTimeout(mostrarPremioSiExiste, 500);
        } else {
            const data = await res.json();
            alert('No se pudo reiniciar el ranking: ' + (data.msg || 'Error desconocido'));
        }
    }
};

startBtn.addEventListener('click', startQuiz);

async function loadQuestions() {
    questions = []; // Reiniciar el array
    const res = await fetch('questions.json');
    questions = await res.json();
}

function getQuestionsByDifficulty(score, allQuestions) {
    // Asignar dificultad por defecto
    const easy = allQuestions.filter(q => (q.difficulty || 'fácil') === 'fácil');
    const medium = allQuestions.filter(q => q.difficulty === 'media');
    const hard = allQuestions.filter(q => q.difficulty === 'difícil');
    let pool = [];
    if (score < 15) {
        pool = easy;
    } else if (score < 30) {
        pool = easy.concat(medium);
    } else if (score < 45) {
        pool = medium.concat(hard);
    } else {
        pool = hard.length > 0 ? hard : allQuestions;
    }
    return pool;
}

async function startQuiz() {
    startBtn.classList.add('hidden');
    quizDetails.classList.add('hidden');
    resultsDiv.classList.add('hidden');
    currentQuestion = 0;
    score = 0;
    results = [];
    questions = [];
    try {
        await loadQuestions(); // Espera explícitamente a que se carguen
        // Seleccionar preguntas según dificultad y evitar repetir las del último intento
        let lastQuestions = JSON.parse(localStorage.getItem('last-quiz-questions') || '[]');
        let pool = getQuestionsByDifficulty(score, questions).filter(q => !lastQuestions.includes(q.question));
        let selected;
        if (pool.length >= 10) {
            selected = shuffleArray(pool).slice(0, 10);
        } else {
            selected = shuffleArray(getQuestionsByDifficulty(score, questions)).slice(0, 10);
        }
        questions = selected;
        localStorage.setItem('last-quiz-questions', JSON.stringify(questions.map(q => q.question)));
        showQuestion();
    } catch (error) {
        console.error("Error al cargar preguntas:", error);
        alert("Error al iniciar el cuestionario. Recarga la página.");
    }
}

function shuffleArray(array) {
    let arr = array.slice();
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function showQuestion() {
    clearInterval(timer); // Detiene cualquier temporizador pendiente antes de iniciar uno nuevo
    timeLeft = 60;
    quizCard.innerHTML = '';
    quizCard.classList.remove('hidden');
    if (currentQuestion >= questions.length) {
        showResults();
        return;
    }
    const q = questions[currentQuestion];
    const card = document.createElement('div');
    card.className = 'card';
    const timerDiv = document.createElement('div');
    timerDiv.id = 'timer';
    timerDiv.textContent = `Tiempo restante: ${timeLeft}s`;
    card.appendChild(timerDiv);
    const question = document.createElement('h2');
    question.textContent = q.question;
    card.appendChild(question);
    const optionsDiv = document.createElement('div');
    optionsDiv.className = 'options';
    q.options.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.textContent = opt;
        btn.onclick = () => selectAnswer(idx, btn, q.answer);
        optionsDiv.appendChild(btn);
    });
    card.appendChild(optionsDiv);
    quizCard.appendChild(card);
    timer = setInterval(() => {
        timeLeft--;
        timerDiv.textContent = `Tiempo restante: ${timeLeft}s`;
        if (timeLeft <= 0) {
            clearInterval(timer);
            penalizeAndNext(q.answer);
        }
    }, 1000);
}

function selectAnswer(selected, btn, correct) {
    clearInterval(timer);
    const optionBtns = document.querySelectorAll('.option-btn');
    optionBtns.forEach((b, idx) => {
        b.disabled = true;
        if (idx === correct) {
            b.classList.add('correct');
            b.style.background = '#28a745'; // Verde fuerte
            b.style.color = '#fff';
            b.style.borderColor = '#28a745';
        }
        if (idx === selected && selected !== correct) {
            b.classList.add('incorrect');
        }
    });
    let isCorrect = selected === correct;
    if (isCorrect) {
        score += 5;
        audioCorrecto.currentTime = 0;
        audioCorrecto.play();
    } else {
        score = Math.max(0, score - 3);
        audioIncorrecto.currentTime = 0;
        audioIncorrecto.play();
    }
    results.push({
        pregunta: questions[currentQuestion].question,
        correcta: questions[currentQuestion].options[correct],
        respuesta: questions[currentQuestion].options[selected],
        acierto: isCorrect
    });

    // Mover al siguiente estado después de un retraso para mostrar feedback
    currentQuestion++; // Incrementar antes de la comprobación
    setTimeout(() => {
        if (currentQuestion >= questions.length) {
            showResults(); // Mostrar resultados si es la última pregunta
        } else {
            showQuestion(); // Mostrar la siguiente pregunta si no
        }
    }, 1500);
}

function penalizeAndNext(correct) {
    const optionBtns = document.querySelectorAll('.option-btn');
    optionBtns.forEach((b, idx) => {
        b.disabled = true;
        if (idx === correct) b.classList.add('correct');
    });
    score = Math.max(0, score - 1);
    results.push({
        pregunta: questions[currentQuestion].question,
        correcta: questions[currentQuestion].options[correct],
        respuesta: 'Sin respuesta',
        acierto: false
    });
    setTimeout(() => {
        currentQuestion++;
        showQuestion();
    }, 1500);
}

// --- FUNCIONES PARA USAR EL BACKEND PYTHON (API REST) ---
const API_URL = 'http://localhost:5000';

// Registrar usuario en backend
async function registrarUsuario(nombre, pass) {
    const res = await fetch(`${API_URL}/usuario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, pass })
    });
    return await res.json();
}

// Login: obtener usuario y validar contraseña
async function loginUsuario(nombre, pass) {
    const res = await fetch(`${API_URL}/usuario/${nombre}`);
    if (!res.ok) return false;
    const user = await res.json();
    return user.pass === pass ? { nombre: user.nombre } : false; // No devolver la contraseña
}

// Obtener todos los usuarios (para ranking y admin)
async function obtenerUsuarios() {
    const res = await fetch(`${API_URL}/usuarios`);
    return await res.json();
}

// Actualizar ranking de usuario
async function actualizarRanking(nombre, puntos) {
    await fetch(`${API_URL}/usuario/${nombre}/ranking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ranking: puntos })
    });
}

// Actualizar logros de usuario
async function actualizarLogros(nombre, logros) {
    const usuarioActivo = localStorage.getItem('quiz-usuario-activo');
    fetch(`${API_URL}/usuario/${usuarioActivo}/logros`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logros })
    });
}

// --- LOGIN Y REGISTRO USANDO BACKEND ---
window.addEventListener('DOMContentLoaded', () => {
    const quizContainer = document.querySelector('.quiz-container');
    const loginModal = document.getElementById('login-modal');

    // Función para actualizar la visibilidad basada en el usuario activo
    const updateUI = () => {
        const usuarioActivo = localStorage.getItem('quiz-usuario-activo');
        const particlesDiv = document.getElementById('particles-js');
        console.log('[updateUI] usuarioActivo:', usuarioActivo);
        // PRUEBA: Nunca ocultar quiz-container si hay usuario activo
        if (usuarioActivo) {
            loginModal.classList.add('hidden');
            quizContainer.classList.remove('hidden');
            logoutBtn.classList.remove('hidden');
            startBtn.classList.remove('hidden');
            if (particlesDiv) particlesDiv.style.display = 'none';
        } else {
            loginModal.classList.remove('hidden');
            // quizContainer.classList.add('hidden'); // <-- Comentado para nunca ocultar
            logoutBtn.classList.add('hidden');
            startBtn.classList.add('hidden');
            if (particlesDiv) particlesDiv.style.display = 'block';
        }
        updateAdminPanelBtn();
    };

    updateUI();

    // Login
    document.getElementById('login-btn').onclick = async function (e) {
        e.preventDefault(); // Evita envío de formulario accidental
        const user = document.getElementById('login-usuario').value.trim();
        const pass = document.getElementById('login-pass').value;
        if (!user || !pass) return alert('Completa ambos campos');
        const usuario = await loginUsuario(user, pass);
        if (usuario) {
            localStorage.setItem('quiz-usuario-activo', user);
            updateUI();
        } else {
            alert('Credenciales incorrectas');
        }
    };

    // Registro
    document.getElementById('register-btn').onclick = async function (e) {
        e.preventDefault(); // Evita envío de formulario accidental
        const user = document.getElementById('login-usuario').value.trim();
        const pass = document.getElementById('login-pass').value;
        if (!user || !pass) return alert('Completa ambos campos');
        const res = await registrarUsuario(user, pass);
        if (!res.error) { // Cambiado: si no hay error, registro exitoso
            localStorage.setItem('quiz-usuario-activo', user);
            updateUI();
        } else if (res.error === 'El usuario ya existe') {
            alert('El usuario ya existe');
        } else {
            alert('Error al registrar el usuario');
        }
    };

    // Mostrar/ocultar botones de login y registro según si el usuario existe
    const loginUsuarioInput = document.getElementById('login-usuario');
    const loginBtn = document.getElementById('login-btn');
    const registerBtn = document.getElementById('register-btn');

    loginUsuarioInput.addEventListener('input', async function () {
        const nombre = loginUsuarioInput.value.trim();
        if (!nombre) {
            loginBtn.classList.remove('hidden');
            registerBtn.classList.remove('hidden');
            return;
        }
        // Consultar si el usuario existe
        try {
            const res = await fetch(`${API_URL}/usuario/${encodeURIComponent(nombre)}`);
            if (res.ok) {
                // Usuario existe: solo mostrar Entrar
                loginBtn.classList.remove('hidden');
                registerBtn.classList.add('hidden');
            } else {
                // Usuario no existe: solo mostrar Registrarse
                loginBtn.classList.add('hidden');
                registerBtn.classList.remove('hidden');
            }
        } catch {
            // Si hay error de red, mostrar ambos
            loginBtn.classList.remove('hidden');
            registerBtn.classList.remove('hidden');
        }
    });

    // Al cerrar sesión, mostrar solo el botón Entrar y mostrar partículas
    logoutBtn.onclick = function () {
        localStorage.removeItem('quiz-usuario-activo');
        updateUI();
        loginBtn.classList.remove('hidden');
        registerBtn.classList.add('hidden');
        const particlesDiv = document.getElementById('particles-js');
        if (particlesDiv) particlesDiv.style.display = 'block';
    };

    let rankingVisible = false;
    rankingBtn.onclick = async function () {
        const rankingSection = document.getElementById('ranking-section');
        const resultsDiv = document.getElementById('results'); // Asegúrate de que esta línea exista si no está ya
        const quizCard = document.getElementById('quiz-card');

        if (!rankingVisible) {
            quizCard.classList.add('hidden');
            rankingSection.classList.remove('hidden');
            await showRanking();
            rankingVisible = true;
        } else {
            rankingSection.classList.add('hidden');
            // Opcional: decidir si mostrar resultsDiv al ocultar el ranking
            // resultsDiv.classList.remove('hidden'); 
            rankingVisible = false;
        }
    };

    // LÓGICA DEL PERFIL
    const profileBtn = document.getElementById('profile-btn');
    const profileModal = document.getElementById('profile-modal');
    const closeProfileModal = document.getElementById('close-profile-modal');
    const profileNameInput = document.getElementById('profile-name');
    const saveProfileBtn = document.getElementById('save-profile-btn');
    const profilePhotoInput = document.getElementById('profile-photo');
    const profileImagePreview = document.getElementById('profile-image-preview');
    // Guardar avatar en localStorage y backend (base64)
    document.addEventListener('DOMContentLoaded', () => {
        profilePhotoInput.addEventListener('change', function () {
            const file = this.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = async function (e) {
                    profileImagePreview.style.backgroundImage = `url('${e.target.result}')`;
                    // Guardar en backend
                    const usuarioActivo = localStorage.getItem('quiz-usuario-activo');
                    if (usuarioActivo) {
                        await fetch(`${API_URL}/usuario/${encodeURIComponent(usuarioActivo)}/avatar`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ avatar: e.target.result })
                        });
                    }
                };
                reader.readAsDataURL(file);
            }
        });
        // Mostrar avatar en el modal si existe en backend
        const usuarioActivo = localStorage.getItem('quiz-usuario-activo');
        if (usuarioActivo) {
            fetch(`${API_URL}/usuario/${encodeURIComponent(usuarioActivo)}/avatar`)
                .then(res => res.json())
                .then(data => {
                    if (data.avatar) {
                        profileImagePreview.style.backgroundImage = `url('${data.avatar}')`;
                    }
                });
        }
    });

    // --- PERFIL USANDO BACKEND ---
    profileBtn.onclick = async function () {
        const usuarioActivo = localStorage.getItem('quiz-usuario-activo');
        if (!usuarioActivo) return;
        try {
            const res = await fetch(`${API_URL}/usuario/${encodeURIComponent(usuarioActivo)}`);
            if (!res.ok) throw new Error('No se pudo obtener el usuario');
            const userData = await res.json();
            profileNameInput.value = usuarioActivo;
            // Mostrar bandera actual
            const profileFlagSelect = document.getElementById('profile-flag');
            if (profileFlagSelect && userData.flag) {
                profileFlagSelect.value = userData.flag;
            } else if (profileFlagSelect) {
                profileFlagSelect.value = '';
            }
            // Mostrar logros correctamente (normalizar)
            let logrosDiv = document.getElementById('profile-achievements');
            if (!logrosDiv) {
                logrosDiv = document.createElement('div');
                logrosDiv.id = 'profile-achievements';
                logrosDiv.style.margin = '10px 0';
                logrosDiv.style.fontSize = '1.1em';
                profileNameInput.parentNode.insertBefore(logrosDiv, profileNameInput.nextSibling);
            }
            if (userData.logros) {
                const logros = userData.logros.split(',').map(l => l.trim()).filter(l => l);
                logrosDiv.innerHTML = '<b>Logros:</b><ul style="margin:5px 0 0 15px;">' +
                    logros.map(logro => `<li>${logro}</li>`).join('') + '</ul>';
            } else {
                logrosDiv.innerHTML = '';
            }
            profileModal.classList.remove('hidden');
        } catch (e) {
            alert('No se pudo cargar el perfil: ' + e.message);
        }
    };

    saveProfileBtn.onclick = async function () {
        const usuarioActivo = localStorage.getItem('quiz-usuario-activo');
        if (!usuarioActivo) return;
        const logrosLis = document.getElementById('profile-achievements').querySelectorAll('li');
        const logrosArray = Array.from(logrosLis).map(li => li.textContent.trim());
        // Guardar bandera seleccionada
        const profileFlagSelect = document.getElementById('profile-flag');
        const flag = profileFlagSelect ? profileFlagSelect.value : '';
        try {
            // Guardar logros
            const res = await fetch(`${API_URL}/usuario/${encodeURIComponent(usuarioActivo)}/logros`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ logros: logrosArray.join(',') })
            });
            if (!res.ok) throw new Error('Error al guardar los logros');
            // Guardar bandera
            await fetch(`${API_URL}/usuario/${encodeURIComponent(usuarioActivo)}/flag`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ flag })
            });
            profileModal.classList.add('hidden');
        } catch (e) {
            alert('Error al actualizar el perfil: ' + e.message);
        }
    }

    // Asegura que la X de cerrar el perfil funcione
    closeProfileModal.onclick = function () {
        profileModal.classList.add('hidden');
    };

    // Quitar el botón de la top-bar si existe
    const btn = document.getElementById('mostrar-season-timer-btn');
    if (btn) btn.remove();
});

// --- GUARDAR RANKING Y MOSTRAR RANKING USANDO BACKEND ---
async function saveRanking(name, score) {
    try {
        // Obtener el ranking actual del usuario directamente
        const res = await fetch(`${API_URL}/usuario/${encodeURIComponent(name)}`);
        if (!res.ok) {
            console.warn('No se pudo obtener el usuario para ranking:', name);
            return; // No intentar actualizar si el usuario no existe
        }
        const userData = await res.json();
        if (!userData || userData.error) {
            console.warn('Usuario no encontrado o error en datos:', name);
            return;
        }
        const rankingActual = userData.ranking || 0;
        const nuevoRanking = rankingActual + score;
        await actualizarRanking(name, nuevoRanking);
    } catch (e) {
        console.error('Error al guardar ranking:', e);
        alert('Error al guardar la puntuación. Inténtalo de nuevo.');
    }
}

async function showRanking() {
    const rankingSection = document.getElementById('ranking-section');
    const rankingList = document.getElementById('ranking-list');
    let users = await obtenerUsuarios();
    // Filtrar para que no aparezca 'admin' en el ranking
    let ranking = users.filter(u => u.nombre !== '').map(u => ({ name: u.nombre, score: u.ranking || 0, flag: u.flag || '' }));
    ranking.sort((a, b) => b.score - a.score);
    ranking = ranking.slice(0, 10);
    rankingList.innerHTML = '';
    ranking.forEach((r) => {
        const li = document.createElement('li');
        li.innerHTML = `<div class="ranking-item"><span>${r.name}</span> ${r.flag ? r.flag : ''} - ${r.score} puntos</div>`;
        rankingList.appendChild(li);
    });
    rankingSection.classList.remove('hidden');
}

function showResults() {
    console.log('Entrando a showResults');
    quizCard.classList.add('hidden');
    resultsDiv.classList.remove('hidden');
    audioFinalizar.currentTime = 0;
    audioFinalizar.play();
    resultsDiv.innerHTML = `<h2>¡Fin del cuestionario!</h2><p>Puntuación final: ${score} puntos</p>`;
    const retryBtn = document.createElement('button');
    retryBtn.textContent = 'Hacer el cuestionario otra vez';
    retryBtn.className = 'retry-btn';
    retryBtn.type = 'button';
    retryBtn.onclick = () => startQuiz();
    resultsDiv.appendChild(retryBtn);
    startBtn.classList.remove('hidden');
    // No llamar a updateUI ni ocultar quiz-container aquí
    const nombre = localStorage.getItem('quiz-usuario-activo');
    if (nombre) {
        saveRanking(nombre, score);
    }
    console.log('Saliendo de showResults');
}

window.onerror = function (msg, url, line, col, error) {
    alert('Error global capturado: ' + msg + '\nEn: ' + url + ':' + line + ':' + col);
    return false;
};

darkModeBtn && darkModeBtn.addEventListener('click', () => {
    console.log('Botón modo oscuro pulsado');
    document.body.classList.toggle('dark');
    // Guardar preferencia en localStorage
    if (document.body.classList.contains('dark')) {
        darkModeBtn.textContent = '☀️ Modo claro';
        localStorage.setItem('quiz-dark', '1');
    } else {
        darkModeBtn.textContent = '🌙 Modo oscuro';
        localStorage.setItem('quiz-dark', '0');
    }
});
// Al cargar, aplicar preferencia
document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('quiz-dark') === '1') {
        document.body.classList.add('dark');
        if (darkModeBtn) darkModeBtn.textContent = '☀️ Modo claro';
    } else {
        document.body.classList.remove('dark');
        if (darkModeBtn) darkModeBtn.textContent = '🌙 Modo oscuro';
    }
});

// --- REINICIO DE RANKING CADA 30 DÍAS Y PREMIOS TOP 3 ---
async function checkAndResetRanking() {
    const now = new Date();
    // Obtener la fecha del último reset desde el backend
    const res = await fetch(`${API_URL}/ranking-reset`);
    const data = await res.json();
    let lastReset = data.last_reset ? new Date(data.last_reset) : null;
    let diffDays = lastReset ? Math.floor((now - lastReset) / (1000 * 60 * 60 * 24)) : 16;
    if (diffDays >= 15) {
        // Hacer POST para reiniciar el ranking y otorgar logros
        const resetRes = await fetch(`${API_URL}/ranking-reset`, { method: 'POST' });
        if (resetRes.ok) {
            mostrarModalTemporada();
            setTimeout(mostrarPremioSiExiste, 500); // Mostrar premio tras reinicio automático
        } else {
            const err = await resetRes.json();
            alert('No se pudo reiniciar el ranking: ' + (err.msg || 'Error desconocido'));
        }
    }
}

function mostrarModalTemporada() {
    // Modal visual bonito para todos los jugadores
    let modal = document.getElementById('temporada-modal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'temporada-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.background = 'rgba(0,0,0,0.85)';
    modal.style.display = 'flex';
    modal.style.flexDirection = 'column';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '9999';
    modal.innerHTML = `
        <div style="background:linear-gradient(120deg,#e0eafc 0%,#cfdef3 100%);padding:48px 36px 36px 36px;border-radius:22px;box-shadow:0 8px 32px rgba(44,62,80,0.18);text-align:center;max-width:95vw;">
            <h2 style="font-size:2.3em;color:#007bff;margin-bottom:18px;">¡Nueva temporada!</h2>
            <div style="font-size:2.8em;margin-bottom:10px;">⏳🏆</div>
            <div style="font-size:1.3em;font-weight:bold;margin-bottom:18px;">El ranking se ha reiniciado.<br>¡Compite para ser el Top 1 quincenal!</div>
            <div style="font-size:1.1em;color:#232526;margin-bottom:22px;">Los mejores jugadores recibirán premios y logros especiales en su perfil.<br>¡Participa y gana!</div>
            <button id="cerrar-temporada-modal" style="padding:12px 32px;font-size:1.1em;border-radius:8px;background:#007bff;color:#fff;border:none;cursor:pointer;">Cerrar</button>
        </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('cerrar-temporada-modal').onclick = function () {
        modal.remove();
    };
}

// Guardar en localStorage la fecha del último premio mostrado
function mostrarModalPremioTop(top, premio) {
    // Elimina cualquier modal anterior
    let modal = document.getElementById('premio-modal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'premio-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.background = 'rgba(44,62,80,0.92)';
    modal.style.display = 'flex';
    modal.style.flexDirection = 'column';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '9999';
    let emoji = '🥉';
    if (top === 1) emoji = '🏆';
    else if (top === 2) emoji = '🥈';
    // Detectar modo oscuro
    const isDark = document.body.classList.contains('dark');
    const bg = isDark ? 'linear-gradient(120deg,#232526 0%,#414345 100%)' : 'linear-gradient(120deg,#e0eafc 0%,#cfdef3 100%)';
    const color = isDark ? '#f1f1f1' : '#232526';
    const borderColor = isDark ? '#00adb5' : '#007bff';
    modal.innerHTML = `
        <div style="background:${bg};padding:40px 30px 30px 30px;border-radius:18px;box-shadow:0 8px 32px rgba(44,62,80,0.18);text-align:center;max-width:90vw;color:${color};border:3px solid ${borderColor};">
            <h2 style="font-size:2.2em;color:${borderColor};margin-bottom:18px;">¡Felicitaciones!</h2>
            <div style="font-size:2.5em;margin-bottom:10px;">${emoji}</div>
            <div style="font-size:1.4em;font-weight:bold;margin-bottom:18px;">Usted quedó Top ${top} de la temporada</div>
            <div style="font-size:1.2em;margin-bottom:22px;"><b>Premio: ${premio}</b></div>
            <button id="cerrar-premio-modal" style="padding:12px 32px;font-size:1.1em;border-radius:8px;background:${borderColor};color:#fff;border:none;cursor:pointer;">Cerrar</button>
        </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('cerrar-premio-modal').onclick = function () {
        modal.remove();
        // Guardar la fecha del último premio mostrado
        localStorage.setItem('quiz-premio-ultimo', new Date().toISOString());
        localStorage.setItem('quiz-premio-ultimo-logro', premio);
    };
}

// Mostrar el premio correspondiente al usuario tras el reinicio SOLO si hay un nuevo logro
function mostrarPremioSiExiste() {
    const usuarioActivo = localStorage.getItem('quiz-usuario-activo');
    if (!usuarioActivo) return;
    fetch(`${API_URL}/usuario/${encodeURIComponent(usuarioActivo)}`)
        .then(res => res.json())
        .then(user => {
            if (!user || !user.logros) return;
            const logros = user.logros.split(',').map(l => l.trim()).filter(l => l);
            let top = null;
            let premio = null;
            for (let i = logros.length - 1; i >= 0; i--) {
                const logro = logros[i].replace(/\s+/g, '');
                if (logro.includes('Top1')) { top = 1; premio = logros[i]; break; }
                if (logro.includes('Top2')) { top = 2; premio = logros[i]; break; }
                if (logro.includes('Top3')) { top = 3; premio = logros[i]; break; }
            }
            // Solo mostrar si el logro es nuevo (no coincide con el último mostrado)
            const ultimoLogroMostrado = localStorage.getItem('quiz-premio-ultimo-logro');
            if (top && premio && premio !== ultimoLogroMostrado) {
                mostrarModalPremioTop(top, premio);
            }
        });
}

// Mostrar modal de premio al iniciar sesión si hay un logro nuevo
window.addEventListener('DOMContentLoaded', mostrarPremioSiExiste);

// Ajuste visual: que el modal de perfil sea scrollable si hay muchos logros
document.addEventListener('DOMContentLoaded', () => {
    const profileModalContent = document.querySelector('#profile-modal .modal-nombre-content');
    if (profileModalContent) {
        profileModalContent.style.maxHeight = '90vh';
        profileModalContent.style.overflowY = 'auto';
    }
});

// TEMPORIZADOR DE TEMPORADA
function mostrarTemporizadorTemporada() {
    // Elimina el temporizador anterior si existe
    const prev = document.getElementById('season-timer');
    if (prev) prev.remove();
    const timerDiv = document.createElement('div');
    timerDiv.id = 'season-timer';
    timerDiv.style.position = 'fixed';
    timerDiv.style.right = '24px';
    timerDiv.style.bottom = '24px';
    timerDiv.style.background = 'linear-gradient(90deg,#e0eafc 0%,#cfdef3 100%)';
    timerDiv.style.color = '#232526';
    timerDiv.style.padding = '14px 28px 14px 28px';
    timerDiv.style.borderRadius = '14px';
    timerDiv.style.fontSize = '1.2em';
    timerDiv.style.boxShadow = '0 2px 12px rgba(44,62,80,0.10)';
    timerDiv.style.zIndex = '999';
    timerDiv.style.fontWeight = 'bold';
    timerDiv.style.display = 'flex';
    timerDiv.style.alignItems = 'center';
    timerDiv.style.gap = '12px';
    // Solo texto, sin botón de cerrar
    const texto = document.createElement('span');
    timerDiv.appendChild(texto);
    document.body.appendChild(timerDiv);

    async function updateTimer() {
        const res = await fetch(`${API_URL}/ranking-reset`);
        const data = await res.json();
        let lastReset = data.last_reset ? new Date(data.last_reset) : null;
        if (!lastReset) {
            texto.textContent = 'Temporada: Sin datos';
            return;
        }
        const now = new Date();
        const nextReset = new Date(lastReset.getTime() + 15 * 24 * 60 * 60 * 1000);
        const diffMs = nextReset - now;
        if (diffMs <= 0) {
            texto.textContent = '¡Nueva temporada en curso!';
            return;
        }
        const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const horas = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
        const minutos = Math.floor((diffMs / (1000 * 60)) % 60);
        texto.textContent = `⏳ Faltan ${dias} días, ${horas}h, ${minutos}m para el reinicio de temporada`;
    }
    updateTimer();
    setInterval(updateTimer, 60000); // Actualiza cada minuto
}
window.addEventListener('DOMContentLoaded', () => {
    // Botón para mostrar/ocultar el temporizador de temporada en la top-bar
    let topBar = document.querySelector('.top-bar');
    if (topBar && !document.getElementById('toggle-season-timer-btn')) {
        const btn = document.createElement('button');
        btn.id = 'toggle-season-timer-btn';
        btn.textContent = '⏳ Ver reinicio de temporada';
        btn.className = 'top-btn';
        btn.style.marginLeft = '8px';
        let visible = true;
        function mostrarTemporizador() {
            if (!document.getElementById('season-timer')) {
                mostrarTemporizadorTemporada();
            }
            btn.textContent = '⏳ Ocultar reinicio de temporada';
            visible = true;
        }
        function ocultarTemporizador() {
            const timer = document.getElementById('season-timer');
            if (timer) timer.remove();
            btn.textContent = '⏳ Ver reinicio de temporada';
            visible = false;
        }
        btn.onclick = function () {
            if (visible) {
                ocultarTemporizador();
            } else {
                mostrarTemporizador();
            }
        };
        // Mostrar temporizador por defecto
        mostrarTemporizador();
        topBar.appendChild(btn);
    }
});

window.addEventListener('beforeunload', function (e) {
    console.log('Evento beforeunload: la página está a punto de recargarse o cerrarse.');
});
window.addEventListener('unload', function (e) {
    console.log('Evento unload: la página se está recargando o cerrando.');
});
