/// Configuration centrale de l'app. `apiBaseUrl` doit pointer vers l'instance
/// Besewu backend — utiliser 10.0.2.2 (pas localhost) pour joindre la machine hôte
/// depuis un émulateur Android, ou l'IP LAN réelle pour un terminal physique.
class AppConfig {
  AppConfig._();

  static const String apiBaseUrl = String.fromEnvironment(
    'BESEWU_API_URL',
    defaultValue: 'http://10.0.2.2:3000',
  );

  /// Durée max (en heures) sans synchronisation avant verrouillage local de
  /// l'app — reflète MAX_OFFLINE_HOURS côté backend (section 2 de la revue
  /// critique). Doit rester cohérent avec la config serveur.
  static const int maxOfflineHours = 72;

  /// Montants prédéfinis pour l'encaissement "en 2 clics" (cahier des charges
  /// original, section 3.1). En FCFA.
  static const List<int> predefinedAmounts = [100, 200, 500];
}
