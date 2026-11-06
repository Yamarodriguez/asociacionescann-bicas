# Sistema de la asociación (prototipo)

Prototipo privado con **datos inventados**. No introduzcas datos de personas reales.

## Qué hace hoy

- Solicitud de alta con control de edad en el servidor.
- Acceso único para socios y equipo.
- Aprobación manual tras verificar la identidad en persona.
- Panel con la cola de solicitudes y permisos por rol.
- Portal del socio con carné, cuota, publicaciones, exportación de datos y pedido de baja.
- Panel con cuotas, publicaciones, configuración, auditoría y recuperación de contraseña.
- Doble factor para el equipo y copias cifradas con restauración comprobada.
- Cultivo con trazabilidad por lote y por planta, tareas e inventario, apagados por defecto y solo con datos inventados.
- Caja, presupuesto, mora, vencimientos, procedimientos, capacitaciones e informe de inspección.
- Turnos, fichaje, notas de traspaso, proyectos, calendario y pedidos a proveedores.
- Web pública con aviso de edad, formulario de contacto y textos legales en borrador.

## Cómo abrirlo en tu ordenador

Necesitas tener instalados Node y Python. La primera vez, ejecuta estas dos órdenes en la carpeta del proyecto:

```bash
npm install
```

```bash
npm run preparar
```

Después, cada vez que quieras usarlo:

```bash
npm run dev
```

Abre `http://localhost:8080`. Para cerrarlo, pulsa `Ctrl + C` en esa ventana.

Las cuentas inventadas y su contraseña están en `.dev/credenciales_prueba.txt`. Ese archivo no se sube a Git.

## Cómo comprobar que todo funciona

```bash
npm run todo
```

Si todo va bien, termina con `TODO CORRECTO: 0 fallos`. Si algo falla, se detiene y muestra `SE HA PARADO EN:` seguido del paso. El detalle queda en la carpeta `informes/`.

## Carpetas

| Carpeta | Contenido |
| --- | --- |
| `web/` | Pantallas |
| `servidor/` | Rutas y seguridad del servidor |
| `netlify/` | Función de Netlify y migraciones de la base |
| `herramientas/` | Utilidades para pruebas y mantenimiento |
| `pruebas/` | Comprobaciones automáticas |
| `scripts/` | Arranque, datos de prueba y validador |

## Variables de entorno

Están documentadas en `.env.example`. Los secretos reales van solo en `.env`, que nunca se sube a Git.

## Despliegue

Se publica en Netlify. Los pasos están en [despliegue/LEEME.md](despliegue/LEEME.md).
