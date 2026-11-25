/*
  IdentityStackScreens
  - 2026-01-09: Minimal stack for the new Identity bottom tab.
  - 2026-01-12: Updated to use IdentityHome (redesigned grid layout).
  - 2026-01-23: Added VerusIdDetails screen for full-screen identity view with attestations.
    Added ViewAttestation screen for viewing attestation details from within Identity tab.
    VerusIdDetails uses navigation header with Back button matching SendWizard style.
  - 2026-11-18: Added IdentityRegistration flow so VerusIDs can be registered from the Identity tab.
*/
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import IdentityHome from '../../Identity/Home/IdentityHome';
import VerusIdDetails from '../../Identity/VerusIdDetails/VerusIdDetails';
import ViewAttestation from '../../Services/ServiceComponents/AttestationService/ViewAttestation/ViewAttestation';
import IdentityRegistrationNavigator from '../../Services/ServiceComponents/VerusIdService/IdentityRegistration/IdentityRegistrationNavigator';
import Colors from '../../../globals/colors';

const IdentityStack = createStackNavigator();

const IdentityStackScreens = () => {
  return (
    <IdentityStack.Navigator screenOptions={{ headerShown: false }}>
      <IdentityStack.Screen
        name="IdentityHome"
        component={IdentityHome}
      />
      <IdentityStack.Screen
        name="VerusIdDetails"
        component={VerusIdDetails}
        options={{
          headerShown: true,
          headerBackTitle: 'Back',
          headerShadowVisible: false,
          headerStyle: {
            backgroundColor: 'white',
            elevation: 0,
            shadowOpacity: 0,
          },
          headerTintColor: Colors.quinaryColor,
          headerTitleStyle: {
            fontWeight: '600',
            fontSize: 17,
            color: Colors.quinaryColor,
          },
        }}
      />
      <IdentityStack.Screen
        name="ViewAttestation"
        component={ViewAttestation}
        options={{
          headerShown: true,
          title: 'Attestation Details',
          headerBackTitle: 'Back',
          headerStyle: {
            backgroundColor: 'white',
          },
          headerTintColor: Colors.quinaryColor,
          headerTitleStyle: {
            fontWeight: '600',
            fontSize: 17,
            color: Colors.quinaryColor,
          },
        }}
      />
      <IdentityStack.Screen
        name="IdentityRegistration"
        component={IdentityRegistrationNavigator}
      />
    </IdentityStack.Navigator>
  );
};

export default IdentityStackScreens;
