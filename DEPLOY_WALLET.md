# Pase de personal en el móvil · Apple Wallet y Google Wallet

Qué hace falta para que el botón «Añadir a Apple Wallet» y el de «Añadir a Google Wallet» del pase
de personal funcionen de verdad. **El pase ya funciona sin nada de esto**: se emite, se guarda como
imagen o PDF y se comprueba escaneando el QR. Lo de aquí es solo para que entre en la app Wallet del
móvil como una tarjeta más.

El código está listo y se activa solo cuando existen las variables de entorno: la app las mira en
cada petición, así que basta con ponerlas en Render (y en Fly, si se quiere que el host CalDAV
también las tenga, aunque ahí no se sirven pases) y reiniciar.

## Cómo funciona por dentro (para saber qué se está configurando)

- **Apple** exige que el fichero `.pkpass` (un zip con `pass.json`, las imágenes, un `manifest.json`
  con el SHA-1 de cada fichero y una **firma PKCS#7** del manifest) esté firmado con un **certificado
  de Pass Type ID** de nuestra cuenta de desarrollador, con el certificado intermedio **WWDR** de
  Apple en la cadena. Sin esa firma el iPhone dice «no se puede abrir el pase». Lo firma
  `_staff_pass_pkpass_bytes` (en `app.py`) con `cryptography` (ya viene con el push web).
- **Google** no pide certificado: el botón es un **enlace «Guardar»** con un **JWT firmado** por una
  **cuenta de servicio** de Google Cloud autorizada en nuestro **emisor** de Google Wallet. Lo firma
  `_staff_pass_google_save_url`. La clase del pase va dentro del propio JWT, así que se crea sola la
  primera vez que alguien guarda uno.

## Apple Wallet · pasos (una vez)

1. **Apple Developer Program** como organización (33 Producciones): https://developer.apple.com/programs/enroll/
   · Cuesta 99 US$/año. Pide el **número D-U-N-S** de la empresa (gratis, en Dun & Bradstreet; si
     no lo tenemos tarda unos días) y una cuenta de Apple ID de la empresa.
   · La aprobación como organización suele tardar de 1 a 5 días.
2. Entrar en https://developer.apple.com/account → **Certificates, Identifiers & Profiles**.
3. **Identifiers → (+) → Pass Type IDs**: registrar `pass.es.33producciones.personal`
   (descripción «Pase de personal»). Ese texto es `APPLE_PASS_TYPE_ID`.
4. **Membership details**: copiar el **Team ID** (10 caracteres). Es `APPLE_TEAM_ID`.
5. Crear el **certificado del Pass Type ID**. Lo más limpio, desde un Mac con Terminal:
   ```bash
   openssl req -new -newkey rsa:2048 -nodes -keyout pass_key.pem -out pass.csr \
     -subj "/CN=Pass Type ID pass.es.33producciones.personal/O=33 Producciones/C=ES"
   ```
   · En el portal: **Certificates → (+) → Pass Type ID Certificate**, elegir el identificador, subir
     `pass.csr`, descargar `pass.cer`.
   · Pasarlo a PEM: `openssl x509 -inform DER -in pass.cer -out pass_cert.pem`
   · `pass_key.pem` (la clave privada, **no compartir**) es `APPLE_PASS_KEY_PEM`; `pass_cert.pem` es
     `APPLE_PASS_CERT_PEM`. (Si el certificado se hizo desde Acceso a Llaveros, exportar el `.p12` y
     sacar la clave con `openssl pkcs12 -in pass.p12 -nocerts -nodes -out pass_key.pem`; si se le
     puso contraseña al exportar, va en `APPLE_PASS_KEY_PASSWORD`.)
6. El **WWDR** de Apple: https://www.apple.com/certificateauthority/ → «Worldwide Developer Relations
   - **G4**» (`AppleWWDRCAG4.cer`) → `openssl x509 -inform DER -in AppleWWDRCAG4.cer -out wwdr.pem`.
   Es `APPLE_WWDR_PEM`. ⚠️ Tiene que ser el que FIRMÓ nuestro certificado: se comprueba con
   `openssl x509 -in pass_cert.pem -noout -issuer` (debe decir «G4»).
7. En **Render → Environment**: los tres PEM van mejor como **Secret Files** (y en la variable se
   pone la **ruta** del fichero, p. ej. `/etc/secrets/pass_cert.pem`), o pegados enteros en la
   variable (la app admite los saltos de línea reales o escritos como `\n`). Variables:
   `APPLE_PASS_TYPE_ID` · `APPLE_TEAM_ID` · `APPLE_PASS_CERT_PEM` · `APPLE_PASS_KEY_PEM` ·
   `APPLE_WWDR_PEM` · (`APPLE_PASS_KEY_PASSWORD` solo si la clave la lleva).
8. Probar: en el iPhone, Safari → «Mi pase de personal» → **Añadir a Apple Wallet** → se abre la
   hoja de Wallet con la tarjeta roja. Si dice «no se puede abrir», revisar el punto 6 y que el
   Pass Type ID de la variable sea exactamente el del certificado.

El certificado del Pass Type ID **caduca al año**: hay que repetir el punto 5 y cambiar las dos
variables. Los pases ya guardados siguen funcionando.

## Google Wallet · pasos (una vez)

1. **Google Pay & Wallet Console**: https://pay.google.com/business/console → crear el perfil de
   empresa y pedir acceso a la **Google Wallet API**. Al aprobarlo dan un **Issuer ID** (un número
   largo). Es `GOOGLE_WALLET_ISSUER_ID`.
2. **Google Cloud** (https://console.cloud.google.com): un proyecto (p. ej. «33 Producciones Wallet»),
   **APIs y servicios → Habilitar → Google Wallet API**.
3. **IAM → Cuentas de servicio → Crear** («wallet-pases»). En la cuenta creada, **Claves → Añadir
   clave → JSON**: se descarga un `.json`. Ese fichero entero es `GOOGLE_WALLET_SERVICE_ACCOUNT_JSON`
   (como Secret File con su ruta en la variable, o pegado tal cual).
4. En la **Wallet Console → Usuarios → Invitar**: el correo de la cuenta de servicio
   (`wallet-pases@…iam.gserviceaccount.com`) con permiso de **Desarrollador**. Sin esto Google
   rechaza el enlace.
5. Mientras la cuenta esté en **modo demo** solo pueden guardar el pase las cuentas de Google que se
   añadan como **probadores** en la consola (nuestras). Para que valga para todo el personal se pide
   el paso a **producción** desde la misma consola («Publishing access»).
6. Probar: en un Android, «Mi pase de personal» → **Añadir a Google Wallet** → Google enseña la
   tarjeta y el botón «Guardar».

## Lo que NO hace todavía (y se puede añadir después)

- **Actualizar el pase ya guardado** (Apple: `webServiceURL` + notificaciones push; Google:
  `PATCH` del objeto). Hoy **renovar** emite un pase nuevo (otro número de serie) y el viejo se
  queda en el móvil hasta que la persona lo borre; si alguien lo escanea, la app dice «anulado»,
  así que no hay riesgo, solo un pase de más en el Wallet.
- Registrar quién ha añadido el pase al Wallet (Apple lo avisa al servicio web; sin él no se sabe).
