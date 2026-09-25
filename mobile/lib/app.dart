import 'package:flutter/material.dart';
import 'features/splash_screen.dart';

class BesewuApp extends StatelessWidget {
  const BesewuApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Besewu',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorSchemeSeed: const Color(0xFF0B6E4F), // vert — évoque les recettes publiques/marché
        useMaterial3: true,
      ),
      home: const SplashScreen(),
    );
  }
}
