import sqlite3
conn = sqlite3.connect('quiz.db')
c = conn.cursor()
c.execute("ALTER TABLE usuarios ADD COLUMN avatar TEXT DEFAULT ''")
conn.commit()
conn.close()
print("Columna 'avatar' agregada correctamente.")
