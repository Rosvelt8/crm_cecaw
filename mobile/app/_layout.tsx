// Import a effet de bord : enregistre la tache de geolocalisation aupres du
// systeme des le lancement. Sans lui, un reveil en arriere-plan echouerait.
import '../src/tracking';

import React, { useCallback, useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
// Import par graisse et non depuis l'index du paquet : l'index reexporte
// toutes les variantes (66 fichiers .ttf), qui finiraient toutes dans l'APK.
import { Poppins_400Regular } from '@expo-google-fonts/poppins/400Regular';
import { Poppins_500Medium } from '@expo-google-fonts/poppins/500Medium';
import { Poppins_600SemiBold } from '@expo-google-fonts/poppins/600SemiBold';
import { Poppins_700Bold } from '@expo-google-fonts/poppins/700Bold';
import { Poppins_900Black } from '@expo-google-fonts/poppins/900Black';
import { PlayfairDisplay_700Bold } from '@expo-google-fonts/playfair-display/700Bold';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono/500Medium';
import { useSession } from '../src/store/session';
import { AutoLockProvider } from '../src/components/AutoLockProvider';
import { colors, fonts } from '../src/theme';

// L'ecran natif reste affiche tant que les polices ne sont pas pretes :
// evite le clignotement d'une typographie systeme remplacee apres coup.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const status = useSession((s) => s.status);
  const bootstrap = useSession((s) => s.bootstrap);

  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_900Black,
    PlayfairDisplay_700Bold,
    JetBrainsMono_500Medium,
  });

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const onReady = useCallback(() => {
    // Une police manquante ne doit pas bloquer l'agent sur un ecran noir :
    // on demarre malgre tout, avec la typographie systeme en secours.
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider onLayout={onReady}>
      <StatusBar style="light" />
      <AutoLockProvider>
        {/*
          `Stack.Protected` retire purement et simplement les ecrans interdits de
          la pile : impossible de revenir en arriere sur une zone authentifiee
          apres un verrouillage, contrairement a une redirection.
        */}
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            // Meme en-tete que les onglets, pour que les ecrans pousses par
            // dessus (fiches, formulaires, parametres) restent dans la marque.
            headerStyle: { backgroundColor: colors.brandDeep },
            headerTitleStyle: { color: colors.onBrand, fontFamily: fonts.semibold, fontSize: 17 },
            headerTintColor: colors.onBrand,
            headerShadowVisible: false,
          }}
        >
          <Stack.Protected guard={status === 'loading'}>
            <Stack.Screen name="index" />
          </Stack.Protected>

          <Stack.Protected guard={status === 'signedOut'}>
            <Stack.Screen name="login" />
          </Stack.Protected>

          <Stack.Protected guard={status === 'pinSetup'}>
            <Stack.Screen name="pin-setup" />
          </Stack.Protected>

          <Stack.Protected guard={status === 'locked'}>
            <Stack.Screen name="pin-unlock" />
          </Stack.Protected>

          <Stack.Protected guard={status === 'ready'}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="parametres"
              options={{ headerShown: true, title: 'Profil et paramètres' }}
            />
            <Stack.Screen
              name="prospect/nouveau"
              options={{ headerShown: true, title: 'Nouveau prospect' }}
            />
            <Stack.Screen
              name="prospect/[id]"
              options={{ headerShown: true, title: 'Fiche prospect' }}
            />
            <Stack.Screen
              name="client/[id]"
              options={{ headerShown: true, title: 'Fiche client' }}
            />
            <Stack.Screen
              name="compte/[id]"
              options={{ headerShown: true, title: 'Opération de collecte' }}
            />
          </Stack.Protected>
        </Stack>
      </AutoLockProvider>
    </SafeAreaProvider>
  );
}
