# RIC SERVICE – versión 2

## Perfiles de acceso
| Perfil | Usuario | Contraseña | Qué puede hacer |
|---|---|---|---|
| Administrador (principal) | `admin` | `ric2026` | Todo, incluida la ventana **Usuarios** |
| Empleado (cuenta compartida) | `empleado` | `taller2026` | Clientes, vehículos, diagnóstico y órdenes de trabajo (puede corregirlas) |

**Gestión de usuarios (ventana «Usuarios», solo administrador):** cada mecánico o empleado puede tener **su propio usuario y contraseña**. Al editarlo se le cambia el tipo: **EMPLEADO** (acceso restringido) o **ADMINISTRADOR** (acceso total), así un mecánico de confianza puede ser administrador. Si al editar dejas la contraseña vacía, no se cambia. Las contraseñas se guardan cifradas. Un administrador no puede borrarse ni quitarse el acceso a sí mismo.

### Cambiar las cuentas principales (recomendado)
En Render → tu servicio → **Environment**, agrega estas variables (no hace falta tocar el código):

- `JEFE_USUARIO`, `JEFE_CLAVE`
- `EMPLEADO_USUARIO`, `EMPLEADO_CLAVE`
- `TOKEN_SECRET` (cualquier texto largo y secreto; mantiene las sesiones aunque Render reinicie)
- `DATABASE_URL` (la de Neon, igual que antes)

## Escritura en los formularios
- Todo texto se escribe en **MAYÚSCULA** automáticamente (nombres, marca, color, repuestos, observaciones…).
- Nombres y apellidos, profesión, marca y color: **solo letras**. Celular, **cédula de identidad (clientes y mecánicos, 5 a 10 dígitos; no se repite)**, cantidades y precios: **solo números**. **Modelo del vehículo = año** (4 números, ej. 2015); si quieres poner la línea, va en la marca (ej. TOYOTA COROLLA).
- El mecánico tiene **fecha de inicio de contrato**.
- Mano de obra con **un solo precio fijo** por reparación: se define en «Precios» y se usa tal cual en la orden.
- En el **Historial** (administrador) se puede **✔ Entregar** una orden.

## Orden de trabajo, repuestos y ganancias (novedades)
- **Diagnóstico:** elección múltiple de tipos de reparación (sin costos), **repuestos que se usarían** (opcional) + observaciones. Esos repuestos aparecen **ya marcados** en la orden de trabajo del mismo vehículo (el inventario solo se descuenta al guardar la orden).
- **Orden de trabajo:** muestra la observación del diagnóstico, las reparaciones con su **mano de obra (precio fijo)**, y se elige si es **reparación completa** (mano de obra + repuestos) o **solo mano de obra**. El resumen muestra mano de obra, repuestos, total y cuánto saldría solo la mano de obra.
- **Repuestos (jefe):** inventario con precio y cantidad. Colores: verde = disponible, amarillo = pocos, rojo = **AGOTADO / ya no hay este repuesto**. Se descuentan solos al guardar una orden (completa) y se devuelven si la orden en curso se elimina. Todo es editable.
- **Precios (jefe):** mano de obra de cada reparación. Una orden ya hecha conserva los precios con los que se cobró.
- **Historial (administrador):** todos los trabajos con sus precios; aparecen solos al registrar la orden. Filtros: Todos / En curso / Entregados. Botón **✔ Entregar** y **reabrir**.
- **Ganancias (jefe):** trabajos **entregados**, **por día**, **por semana** (lunes a domingo) o **por mes**. Hay tarjetas de Hoy, Semana, Mes y Total; con «Elegir un día» se ve lo ganado ese día y los trabajos que entraron. También se ve cuánto fue mano de obra y cuánto repuestos.
- Los precios de mano de obra y los repuestos que trae el sistema son **de ejemplo**: el jefe debe corregirlos.

## Consulta del cliente
Solo con la **placa**: 4 números + 3 letras mayúsculas (ejemplo `1234ABC`). La placa no se puede repetir entre vehículos.

## Datos de prueba anteriores
La versión anterior guardaba los datos con otro formato. Antes de usar la v2, borra los datos de prueba en Neon (SQL Editor):

    DELETE FROM registros;

Al arrancar, el sistema vuelve a cargar solo la lista de precios de ejemplo (el jefe debe revisarlos en la ventana **Precios**).

## Ver el sistema en tu computadora
**Opción A (recomendada):** doble clic en `INICIAR.bat`. La primera vez instala todo (necesita internet una sola vez); después funciona **sin internet**.

O a mano:

    npm install      # solo la primera vez
    npm start        # http://localhost:3000   (usa SQLite local si no hay DATABASE_URL)

**Opción B (sin instalar nada): modo demostración.** Si abres `public/index.html` con doble clic (o con Live Server), aparece un aviso amarillo *MODO DEMOSTRACIÓN* y todo funciona igual (jefe, empleado, consulta, historial), pero los datos se guardan solo en ese navegador. El botón del aviso los borra. En Internet (Render) este modo nunca se activa.
Nota: sin `npm install` y sin internet la página funciona pero se ve sin los estilos de Bootstrap. El aviso amarillo **solo aparece en este modo**, es pequeño y tiene una ✕ para cerrarlo; con `INICIAR.bat` o en Internet nunca aparece.

## Ubicación
Al final de la página, en «Contáctanos», la dirección abre Google Maps y debajo (justo antes del pie de página) está el mapa con el botón **CÓMO LLEGAR** (enlace: https://maps.app.goo.gl/Rg3LDjePVyeUw74P7). El mapa necesita internet.

## Portada
La foto de fondo es un **carrusel transparente** con las fotos de la carpeta `img` (herramientas, repuestos, ambulancia y auto). Para agregar más fotos, ponlas en `public/img` y escribe su nombre en la lista `FOTOS_PORTADA` al final de `index.html`.
