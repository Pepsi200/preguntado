import sqlite3
from flask import Flask, request, jsonify
app = Flask(__name__)

# Permitir CORS solo para el frontend local
from flask_cors import CORS
CORS(app, origins=["http://127.0.0.1:5500", "http://localhost:5500"])

def get_db():
    conn = sqlite3.connect('quiz.db')
    conn.row_factory = sqlite3.Row
    return conn

# Crear tabla si no existe
def init_db():
    conn = get_db()
    c = conn.cursor()
    c.execute('''
    CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT UNIQUE,
        pass TEXT,
        ranking INTEGER DEFAULT 0,
        logros TEXT DEFAULT '',
        flag TEXT DEFAULT ''
    )
    ''')
    # Crear tabla para almacenar la fecha de último reset de ranking
    c.execute('''
    CREATE TABLE IF NOT EXISTS ranking_reset (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_reset TEXT
    )
    ''')
    # Si no existe registro, insertar uno con la fecha actual
    c.execute('SELECT COUNT(*) as count FROM ranking_reset')
    if c.fetchone()['count'] == 0:
        from datetime import datetime
        c.execute('INSERT INTO ranking_reset (id, last_reset) VALUES (1, ?)', (datetime.utcnow().isoformat(),))
    conn.commit()
    conn.close()

init_db()

@app.route('/usuarios', methods=['GET'])
def get_usuarios():
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT nombre, ranking, logros, flag FROM usuarios')
    usuarios = [dict(row) for row in c.fetchall()]
    conn.close()
    return jsonify(usuarios)

@app.route('/usuario', methods=['POST'])
def add_usuario():
    data = request.json
    nombre = data.get('nombre')
    password = data.get('pass')
    if not nombre or not password:
        return jsonify({'error': 'Faltan datos'}), 400
    try:
        conn = get_db()
        c = conn.cursor()
        c.execute('INSERT INTO usuarios (nombre, pass) VALUES (?, ?)', (nombre, password))
        conn.commit()
        conn.close()
        return jsonify({'ok': True})
    except sqlite3.IntegrityError:
        return jsonify({'error': 'El usuario ya existe'}), 409

@app.route('/usuario/<nombre>', methods=['GET'])
def get_usuario(nombre):
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT nombre, pass, ranking, logros, flag FROM usuarios WHERE nombre=?', (nombre,))
    row = c.fetchone()
    conn.close()
    if row:
        return jsonify(dict(row))
    return jsonify({'error': 'No encontrado'}), 404

@app.route('/usuario/<nombre>/ranking', methods=['POST'])
def update_ranking(nombre):
    data = request.json
    puntos = data.get('ranking')
    if puntos is None:
        return jsonify({'error': 'Faltan puntos'}), 400
    conn = get_db()
    c = conn.cursor()
    c.execute('UPDATE usuarios SET ranking=? WHERE nombre=?', (puntos, nombre))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/usuario/<nombre>/logros', methods=['POST'])
def update_logros(nombre):
    data = request.json
    logros = data.get('logros', '')
    conn = get_db()
    c = conn.cursor()
    c.execute('UPDATE usuarios SET logros=? WHERE nombre=?', (logros, nombre))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/usuario/<nombre>/flag', methods=['POST'])
def update_flag(nombre):
    data = request.json
    flag = data.get('flag', '')
    conn = get_db()
    c = conn.cursor()
    c.execute('UPDATE usuarios SET flag=? WHERE nombre=?', (flag, nombre))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/usuario/<nombre>', methods=['DELETE'])
def delete_usuario(nombre):
    conn = get_db()
    c = conn.cursor()
    c.execute('DELETE FROM usuarios WHERE nombre=?', (nombre,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/ranking-reset', methods=['GET', 'POST'])
def ranking_reset():
    conn = get_db()
    c = conn.cursor()
    if request.method == 'GET':
        c.execute('SELECT last_reset FROM ranking_reset WHERE id=1')
        row = c.fetchone()
        last_reset = row['last_reset'] if row else None
        conn.close()
        return jsonify({'last_reset': last_reset})
    elif request.method == 'POST':
        from datetime import datetime, timedelta
        force = False
        try:
            force = request.json.get('force', False)
        except Exception:
            force = False
        c.execute('SELECT last_reset FROM ranking_reset WHERE id=1')
        row = c.fetchone()
        last_reset = row['last_reset'] if row else None
        now = datetime.utcnow()
        if last_reset:
            last_reset_dt = datetime.fromisoformat(last_reset)
            diff_days = (now - last_reset_dt).days
        else:
            diff_days = 16
        if diff_days < 15 and not force:
            conn.close()
            return jsonify({'ok': False, 'msg': 'Aún no ha pasado 15 días desde el último reinicio', 'last_reset': last_reset}), 400
        # Obtener top 3
        c.execute('SELECT nombre FROM usuarios ORDER BY ranking DESC LIMIT 3')
        top3 = [row['nombre'] for row in c.fetchall()]
        premios = ['🏆 Top 1 quincenal', '🥈 Top 2 quincenal', '🥉 Top 3 quincenal']
        for i, nombre in enumerate(top3):
            if nombre:
                c.execute('SELECT logros FROM usuarios WHERE nombre=?', (nombre,))
                logros = c.fetchone()['logros'] or ''
                nuevo_logro = premios[i] + ' - ' + now.strftime('%d/%m/%Y')
                logros = (logros + ',' if logros else '') + nuevo_logro
                c.execute('UPDATE usuarios SET logros=? WHERE nombre=?', (logros, nombre))
        c.execute('UPDATE usuarios SET ranking=0')
        c.execute('UPDATE ranking_reset SET last_reset=? WHERE id=1', (now.isoformat(),))
        conn.commit()
        conn.close()
        return jsonify({'last_reset': now.isoformat(), 'ok': True})

# Lista de usuarios admin por nombre
ADMIN_USERS = {'ronal', 'admin', 'admi', 'marcos2025'}

@app.route('/usuario/<nombre>/isadmin', methods=['GET'])
def is_admin(nombre):
    return jsonify({'is_admin': nombre in ADMIN_USERS})

if __name__ == '__main__':
    app.run(debug=True)
