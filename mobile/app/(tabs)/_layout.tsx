import React from 'react';
import { Platform, Pressable } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
// Import direct de la famille : l'index de @expo/vector-icons embarque
// les 20 polices d'icones, alors qu'une seule est utilisee.
import Feather from '@expo/vector-icons/Feather';
import { colors, fonts } from '../../src/theme';

type IconName = React.ComponentProps<typeof Feather>['name'];

/**
 * Les onglets portent le travail quotidien de l'agent, dans l'ordre du cycle
 * commercial : on prospecte, on convertit en client, on suit ses objectifs.
 * Le profil, la securite et la geolocalisation vivent derriere l'engrenage.
 */
const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Prospects', icon: 'user-plus' },
  { name: 'clients', title: 'Clients', icon: 'users' },
  { name: 'objectifs', title: 'Objectifs', icon: 'target' },
];

export default function TabsLayout() {
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        // Acces aux parametres depuis n'importe quel onglet.
        headerRight: () => (
          <Pressable
            onPress={() => router.push('/parametres')}
            hitSlop={12}
            style={{ paddingHorizontal: 16 }}
            accessibilityRole="button"
            accessibilityLabel="Profil et paramètres"
          >
            <Feather name="settings" size={20} color={colors.onBrand} />
          </Pressable>
        ),
        headerStyle: { backgroundColor: colors.brandDeep },
        headerTitleStyle: { color: colors.onBrand, fontFamily: fonts.semibold, fontSize: 17 },
        headerTintColor: colors.onBrand,
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.mutedLight,
        tabBarLabelStyle: { fontSize: 11, fontFamily: fonts.medium },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: Platform.OS === 'ios' ? 84 : 62,
          paddingTop: 6,
          paddingBottom: Platform.OS === 'ios' ? 26 : 8,
        },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, size }) => (
              <Feather name={tab.icon} size={size - 2} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
