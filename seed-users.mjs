import bcrypt from 'bcrypt';
import { drizzle } from 'drizzle-orm/mysql2';
import { users } from './drizzle/schema.js';
import 'dotenv/config';

const SALT_ROUNDS = 10;

async function seedUsers() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL no está configurada');
    process.exit(1);
  }

  const db = drizzle(process.env.DATABASE_URL);

  const initialUsers = [
    {
      username: 'admin',
      password: 'admin123',
      name: 'Administrador',
      email: 'admin@dashboard.com',
      role: 'admin',
      loginMethod: 'local'
    },
    {
      username: 'user',
      password: 'user123',
      name: 'Usuario Visualizador',
      email: 'user@dashboard.com',
      role: 'user',
      loginMethod: 'local'
    }
  ];

  console.log('🌱 Sembrando usuarios iniciales...\n');

  for (const userData of initialUsers) {
    try {
      // Hash de la contraseña
      const hashedPassword = await bcrypt.hash(userData.password, SALT_ROUNDS);

      // Insertar usuario
      await db.insert(users).values({
        username: userData.username,
        password: hashedPassword,
        name: userData.name,
        email: userData.email,
        role: userData.role,
        loginMethod: userData.loginMethod,
        lastSignedIn: new Date()
      });

      console.log(`✅ Usuario creado: ${userData.username} (${userData.role})`);
      console.log(`   Contraseña: ${userData.password}`);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        console.log(`⚠️  Usuario ya existe: ${userData.username}`);
      } else {
        console.error(`❌ Error al crear usuario ${userData.username}:`, error.message);
      }
    }
  }

  console.log('\n✨ Proceso de sembrado completado');
  process.exit(0);
}

seedUsers().catch((error) => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});
