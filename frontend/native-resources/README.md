# Recursos nativos LocaMais

Este repositório ainda não contém projetos nativos `android/` ou `ios/`. Após criar cada plataforma com `npx cap add android` / `npx cap add ios`:

- **Android:** copie `android/drawable/ic_stat_locamais.png` para `android/app/src/main/res/drawable/ic_stat_locamais.png`. O `capacitor.config.ts` já referencia esse resource ID em `LocalNotifications.smallIcon`. É um recorte monocromático derivado da marca oficial; ícones pequenos do Android devem ser brancos com transparência.
- **iOS:** copie o conteúdo de `ios/AppIcon.appiconset/` para `ios/App/App/Assets.xcassets/AppIcon.appiconset/` e selecione `AppIcon` como App Icon no target do Xcode. O iOS usa o ícone do aplicativo, não um ícone customizado por notificação.
- Execute `npx cap sync` em `frontend/` e aceite a permissão de notificações no dispositivo. Android 13+ e iOS exigem autorização; alarmes exatos não são usados.

O plugin oficial `@capacitor/local-notifications` entrega eventos locais obtidos do endpoint autenticado de notificações. O aplicativo consulta o MySQL via API quando está ativo; se detectar novos eventos durante uma consulta com o app em segundo plano, agenda notificações locais sem duplicar IDs. Sem push remoto, o sistema operacional pode suspender JavaScript em segundo plano ou com o app encerrado; entrega imediata nesses estados requer push e configuração externa, que não fazem parte desta implementação. A caixa interna persistida no MySQL continua sendo a fonte confiável.
