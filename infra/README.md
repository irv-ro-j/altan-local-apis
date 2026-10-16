# Almacenamiento del simulador

Recursos configurados en la cuenta `715728559586`, región `us-east-2`:

- Stack: `amplify-altan-local-apis-storage`.
- Tabla: `altan-local-apis`, Standard, provisionada con 5 RCU y 5 WCU, sin autoscaling ni servicios opcionales de pago.
- Amplify: app `d35166z8sfi9mb`, rama `master`.
- Rol SSR Compute: solamente Amplify y esta app pueden asumirlo.
- Rol de desarrollo: solamente el usuario IAM indicado en `DeveloperPrincipalArn` puede asumirlo.
- Ambos roles acceden únicamente a los registros de esta tabla; no pueden crear ni borrar tablas.

El namespace separa los datos dentro de la tabla. No es una frontera de permisos: los dos roles tienen acceso a toda la tabla del simulador. No debe almacenarse información real de producción.

La tabla se conserva si se elimina el stack (`DeletionPolicy: Retain`). El stack no modifica los permisos del usuario IAM existente. La política disponible en esta cuenta permite aprovisionar DynamoDB mediante CloudFormation; la creación directa por el usuario está restringida.

## Crear o actualizar infraestructura

```powershell
aws cloudformation deploy --stack-name amplify-altan-local-apis-storage --template-file infra/storage.yaml --parameter-overrides DeveloperPrincipalArn=arn:aws:iam::715728559586:user/irv-ro-j AmplifyAppId=d35166z8sfi9mb --capabilities CAPABILITY_IAM --region us-east-2
node scripts/configure-storage.mjs
```

El script consulta los outputs del stack, asigna el rol Compute a la rama y agrega solamente las variables de persistencia, conservando las variables existentes. Acepta `--region`, `--stack`, `--app` y `--branch`. No publica código ni imprime secretos.

## Acceso local

Obtén `DeveloperRoleArn` de los outputs del stack:

```powershell
aws cloudformation describe-stacks --stack-name amplify-altan-local-apis-storage --region us-east-2 --query 'Stacks[0].Outputs'
aws configure set role_arn <DeveloperRoleArn> --profile altan-local-apis
aws configure set source_profile default --profile altan-local-apis
aws configure set region us-east-2 --profile altan-local-apis
aws sts get-caller-identity --profile altan-local-apis
```

El perfil asume un rol temporal; no necesita una nueva access key. `.env.example` utiliza ese perfil y el namespace `local`. En Amplify no se configura `AWS_PROFILE`: el SDK toma las credenciales temporales del rol Compute.

Si Windows confía en certificados de una red corporativa que Node no reconoce, inicia el proceso con `$env:NODE_OPTIONS='--use-system-ca'` en una versión compatible de Node. Para AWS CLI puede usarse un bundle PEM con las raíces de confianza de Windows mediante `AWS_CA_BUNDLE`. No desactives la validación TLS.

## Costos y despliegue

La capacidad de esta tabla cabe en los 25 RCU/25 WCU y 25 GB de la capa gratuita de DynamoDB Standard, siempre que quede cuota disponible en la cuenta pagadora y región. Amplify, transferencias y otros recursos conservan sus cargos habituales. La tabla no tiene un límite automático de almacenamiento.

La configuración AWS queda lista antes de publicar el código. Despliega la rama con estos cambios para que el sitio remoto use DynamoDB. Los datos que existían solamente en memoria no se migran automáticamente; las fixtures se inicializan cuando se usa por primera vez un namespace vacío.
