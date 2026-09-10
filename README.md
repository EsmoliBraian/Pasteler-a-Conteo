# Caja Pastelería

App para controlar día a día la plata de la pastelería/cafetería: carga de ventas por
medio de pago, reparto automático en sobres, deudas y cuotas, gastos fijos, costos y
recetas, retiro personal, y un panel principal con los números clave. Pensada para
usarse desde el celular entre dos personas, con los datos sincronizados en vivo.

- **Stack**: React + Vite + TypeScript + Tailwind CSS + Recharts
- **Datos**: Supabase (Postgres + Auth + Realtime), plan gratuito
- **Hosting**: GitHub Pages, con build y deploy automático por GitHub Actions
- **PWA**: instalable desde el navegador ("Agregar a pantalla de inicio")
- **Responsive**: nav inferior + una columna en el celular, barra lateral + columna
  más ancha en escritorio (a partir de 768px de ancho)

## 1. Crear el proyecto en Supabase

1. Entrá a [supabase.com](https://supabase.com), creá una cuenta si no tenés, y
   tocá **New project**.
2. Elegí un nombre (ej. `caja-pasteleria`), una contraseña de base de datos (guardala,
   no hace falta para nada de esto pero por las dudas) y una región cercana
   (ej. `South America (São Paulo)`).
3. Esperá a que el proyecto termine de crearse (1-2 minutos).

### 1.1. Crear las tablas

1. En el menú lateral, andá a **SQL Editor** → **New query**.
2. Abrí el archivo [`supabase/schema.sql`](supabase/schema.sql) de este repo, copiá
   **todo** el contenido, y pegalo en el editor.
3. Tocá **Run**. Esto crea todas las tablas, la seguridad (RLS) y precarga:
   - Los medios de pago (Efectivo, Alias MP Luz, Alias MP Braian, PosNET, QR Cuenta DNI)
   - Los sobres con sus porcentajes
   - Los gastos fijos mensuales
   - Las categorías de retiro personal
   - El crédito Banco Provincia con sus 2 cuotas pendientes

### 1.2. Crear los dos usuarios (vos y tu novia)

La app no tiene pantalla de registro a propósito — los datos son financieros y solo
ustedes dos deben poder entrar.

1. Andá a **Authentication** → **Users** → **Add user** → **Create new user**.
2. Cargá el email y una contraseña para el primer usuario. Marcá **Auto Confirm User**
   (así no hace falta que confirme el email) y guardá.
3. Repetí el paso para el segundo usuario.

Con eso alcanza — no hace falta tocar nada más de Authentication (el registro público
ya viene deshabilitado por defecto en un proyecto nuevo).

### 1.3. Conseguir la URL y la clave pública (anon key)

1. Andá a **Settings** (ícono de engranaje) → **Data API**.
2. Copiá el valor de **Project URL** (algo como `https://xxxxx.supabase.co`).
3. Andá a **Settings** → **API Keys** y copiá la clave **anon public** (es pública a
   propósito: la seguridad real la da que las tablas exigen login, no que la clave sea
   secreta).

Vas a usar estos dos valores en dos lugares: tu `.env` local (para probar en tu PC) y
los secrets de GitHub Actions (para que la app publicada funcione).

### 1.4. Si el proyecto de Supabase ya estaba creado antes de "Gastos" y "Conteo de caja"

Si ya habías corrido `schema.sql` en una versión anterior de la app, correr todo el
archivo de nuevo no alcanza para agregar las tablas nuevas de golpe con la columna que
se sumó a `withdrawals`. Corré una vez, en SQL Editor, el contenido de cada archivo
nuevo en [`supabase/migrations/`](supabase/migrations/), en orden por fecha. Si estás
arrancando de cero, no hace falta: ya está todo incluido en `schema.sql`.

## 2. Probar en tu computadora (opcional)

```bash
npm install
cp .env.example .env
# editá .env y pegá tu VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm run dev
```

Abrí la URL que te muestra la terminal e iniciá sesión con uno de los dos usuarios que
creaste.

## 3. Publicar en GitHub Pages

### 3.1. Subir el código

Si todavía no está en GitHub:

```bash
git init
git add .
git commit -m "Primera versión de Caja Pastelería"
git branch -M main
git remote add origin git@github.com:EsmoliBraian/Pasteler-a-Conteo.git
git push -u origin main
```

### 3.2. Cargar las claves de Supabase como secrets

1. En GitHub, entrá al repo → **Settings** → **Secrets and variables** → **Actions**.
2. Tocá **New repository secret** y creá:
   - `VITE_SUPABASE_URL` = la Project URL de Supabase
   - `VITE_SUPABASE_ANON_KEY` = la clave anon public

Sin esto, el build funciona pero la app publicada va a mostrar la pantalla de "Falta
configurar Supabase".

### 3.3. Activar GitHub Pages

1. En el repo, andá a **Settings** → **Pages**.
2. En **Build and deployment** → **Source**, elegí **GitHub Actions**.

Con eso, cada `git push` a `main` dispara el workflow en
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), que compila la app y
la publica. Se puede seguir el progreso en la pestaña **Actions** del repo.

Cuando termine (1-2 minutos), la app va a estar en:

```
https://esmolibraian.github.io/Pasteler-a-Conteo/
```

## 4. Instalar la app en el celular

1. Abrí la URL de arriba desde Chrome (Android) o Safari (iPhone).
2. Iniciá sesión con tu usuario.
3. Andá al menú del navegador y elegí **Agregar a pantalla de inicio** (o **Instalar
   app**, según el navegador).
4. Repetí en el otro celular con el otro usuario.

Los dos van a ver los mismos datos en vivo: lo que uno carga aparece en el otro
celular sin recargar.

## Notas sobre el diseño de la app

- **Todo se reparte sobre el neto**, no sobre el bruto: cada medio de pago tiene una
  comisión y una cantidad de días de acreditación (editables en Ajustes), y el reparto
  en sobres se calcula sobre lo que efectivamente entra a caja.
- **Los sobres son la única fuente de verdad del saldo**: cada ingreso (reparto de una
  venta) y cada egreso (pago de un gasto fijo, una cuota, un retiro, un gasto) queda
  registrado como un movimiento. El saldo de un sobre es la suma de sus movimientos,
  nunca un número que se edita a mano. La pantalla de Sobres solo muestra el saldo de
  cada uno (sin historial ni carga manual de movimientos, a pedido).
- **La ganancia del mes** se calcula como el neto del mes multiplicado por el
  porcentaje de los sobres marcados como "ganancia" (por defecto, Retiro + Reservas =
  38%). Si cambiás los porcentajes de los sobres en Ajustes, este cálculo se ajusta
  solo.
- **Gastos** (en Más → Gastos) es la forma rápida de cargar cualquier gasto suelto,
  marcando si fue del local o personal (mío/de mi novia). Los gastos "del local"
  (insumos, proveedores, compras al local) descuentan del sobre "Insumos y
  proveedores"; los "personales" descuentan del sobre "Retiro de nosotros" (y por lo
  tanto de "cuánto podemos retirar"). La app avisa si el sobre correspondiente queda
  en negativo. Una compra con tarjeta de crédito a una sola cuota (ej. MercadoLibre)
  se carga igual, como gasto del local — no hace falta pasarla por Deudas, que es
  para financiaciones en varias cuotas.
- **Conteo de caja** (en Más → Conteo de caja) compara, para cada medio de pago, lo
  que "debería" haber (neto vendido por ese medio menos los gastos/retiros marcados
  como salidos de ahí) contra lo que efectivamente hay contado a mano. No tiene en
  cuenta gastos fijos ni cuotas de deuda, que no salen de la plata física del día a
  día.
- **"Plata en mano"** (en el panel principal) muestra el último conteo cargado de cada
  medio de pago y qué porcentaje de ese total ya tiene destino este mes (gastos fijos
  + cuotas de deuda que vencen este mes).
- **"Retiro sano proyectado"** (panel principal y Retiro personal) toma el neto
  vendido y lo proyecta al ritmo de los DÍAS CON VENTA CARGADA este mes, no al día del
  calendario — así, si recién empezaste a cargar ventas de una semana puntual aunque
  el mes ya iba más avanzado, la proyección no sale artificialmente baja. Es el % del
  sobre "Retiro de nosotros" aplicado a esa proyección. Cada categoría de retiro
  muestra qué porcentaje de ese retiro sano representa su presupuesto configurado.
- **Compras con tarjeta** (en Más → Compras con tarjeta) es para compras a una sola
  cuota (ej. MercadoLibre), no para financiaciones en varias cuotas (eso es Deudas).
  Cada compra se vincula a una tarjeta (se pueden crear las que hagan falta), tiene
  fecha de compra y fecha en la que hay que pagarla, y descuenta del sobre
  correspondiente en el momento de cargarla (Insumos si es "del local", Retiro si es
  "personal") — igual que un Gasto, pero con seguimiento de vencimiento y estado
  pendiente/pagada para saber cuánto se viene en la próxima tarjeta.
- **Importar desde Excel** (en Costos y recetas) está calibrado contra archivos reales
  de Fudo: éste exporta dos archivos separados, uno con hojas "Ingredientes" +
  "Subingredientes" y otro con "Productos" + "Recetas" — se pueden subir juntos o de a
  uno. La hoja "Subingredientes" de Fudo es la composición de un ingrediente compuesto
  (ej. "Cookie" hecha de harina, huevo, etc.), no una lista con nombre/rendimiento
  propio — la app lo reconoce así automáticamente. Los productos con "Activo = No" se
  ignoran. Siempre se muestra una vista previa con avisos antes de guardar nada.

## Estructura del proyecto

```
src/
  components/   Layout (nav inferior), UI compartida (Card, Button, inputs, etc.)
  hooks/        useTable: fetch + suscripción en tiempo real a una tabla de Supabase
  lib/          cliente de Supabase, auth, cálculos financieros, formateo, import Excel
  pages/        una página por sección de la app
  types/        tipos TypeScript que reflejan las tablas de Supabase
supabase/
  schema.sql    todo el esquema de base de datos + datos precargados (para empezar de cero)
  migrations/   cambios incrementales para un proyecto de Supabase ya existente
.github/workflows/
  deploy.yml    build y deploy automático a GitHub Pages
```
