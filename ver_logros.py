import sqlite3

conn = sqlite3.connect('quiz.db')
c = conn.cursor()
print("Usuarios, ranking y logros actuales:")
for row in c.execute("SELECT nombre, ranking, logros FROM usuarios"):
    print(f"Usuario: {row[0]} | Ranking: {row[1]} | Logros: {row[2]}")
conn.close()
