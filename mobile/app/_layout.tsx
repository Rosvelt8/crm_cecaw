// Import a effet de bord : enregistre la tache de geolocalisation aupres du
// systeme des le lancement. Sans lui, un reveil en arriere-plan echouerait.
import '../src/tracking';

import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useSession } from '../src/store/session';
import { AutoLockProvider } from '../src/components/AutoLockProvider';

export default function RootLayout() {
  const status = useSession((s) => s.status);
  const bootstrap = useSession((s) => s.bootstrap);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AutoLockProvider>
        {/*
          `Stack.Protected` retire purement et simplement les ecrans interdits de
          la pile : impossible de revenir en arriere sur une zone authentifiee
          apres un verrouillage, contrairement a une redirection.
        */}
        <Stack screenOptions={{ headerShown: false }}>
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
              name="prospect/nouveau"
              options={{ headerShown: true, title: 'Nouveau prospect' }}
            />
            <Stack.Screen
              name="client/[id]"
              options={{ headerShown: true, title: 'Fiche client' }}
            />
            <Stack.Screen
              name="compte/[id]"
              options={{ headerShown: true, title: 'Operation de collecte' }}
            />
          </Stack.Protected>
        </Stack>
      </AutoLockProvider>
    </SafeAreaProvider>
  );
}
