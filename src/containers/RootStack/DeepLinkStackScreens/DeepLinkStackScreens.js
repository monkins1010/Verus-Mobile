import React from 'react';
import { createStackNavigator } from "@react-navigation/stack";
import { defaultHeaderOptions } from '../../../utils/navigation/header';
import DeepLink from '../../DeepLink/DeepLink';
import AuthenticationRequestIdentity from '../../DeepLink/AuthenticationRequestIdentity/AuthenticationRequestIdentity';
import GenericRequestComplete from '../../DeepLink/GenericRequestComplete/GenericRequestComplete';
import LoginRequestIdentity from '../../DeepLink/LoginRequestIdentity/LoginRequestIdentity';
import LoginRequestComplete from '../../DeepLink/LoginRequestComplete/LoginRequestComplete';
import InvoicePaymentConfiguration from '../../DeepLink/InvoicePaymentConfiguration/InvoicePaymentConfiguration';
import PersonalSelectData from '../../DeepLink/PersonalSelectData/PersonalSelectData';
import ProfileStackScreens from '../ProfileStackScreens/ProfileStackScreens';
import LoginReceiveAttestation from '../../DeepLink/LoginReceiveAttestation/LoginReceiveAttestation';
import LoginShareAttestation from '../../DeepLink/LoginShareAttestation/LoginShareAttestation';
import LoginSignDataRequest from '../../DeepLink/LoginSignDataRequest/LoginSignDataRequest';
import ViewAttestation from '../../Services/ServiceComponents/AttestationService/ViewAttestation/ViewAttestation';

const DeepLinkStack = createStackNavigator();

const DeepLinkStackScreens = props => {
  return (
    <DeepLinkStack.Navigator
      screenOptions={defaultHeaderOptions}
    >
      <DeepLinkStack.Screen
        name="VerifyDeepLink"
        component={DeepLink}
        options={{
          headerShown: false
        }}
      />
      <DeepLinkStack.Screen
        name="LoginRequestIdentity"
        component={LoginRequestIdentity}
        options={{
          headerRight: () => null,
          title: "Select Identity"
        }}
      />
      <DeepLinkStack.Screen
        name="AuthenticationRequestIdentity"
        component={AuthenticationRequestIdentity}
        options={{
          headerRight: () => null,
          title: "Select Identity"
        }}
      />
      <DeepLinkStack.Screen
        name="LoginRequestComplete"
        component={LoginRequestComplete}
        options={{
          headerShown: false
        }}
      />
      <DeepLinkStack.Screen
        name="GenericRequestComplete"
        component={GenericRequestComplete}
        options={{
          headerShown: false
        }}
      />
      <DeepLinkStack.Screen
        name="InvoicePaymentConfiguration"
        component={InvoicePaymentConfiguration}
        options={{
          headerRight: () => null,
          title: "Configure Payment"
        }}
      />
      <DeepLinkStack.Screen
        name="PersonalSelectData"
        component={PersonalSelectData}
        options={{
          headerRight: () => null,
          title: "Personal Data"
        }}
      />
      <DeepLinkStack.Screen
        name="ProfileStackScreens"
        component={ProfileStackScreens}
        options={{ headerShown: false }}
      />
      <DeepLinkStack.Screen
        name="LoginReceiveAttestation"
        component={LoginReceiveAttestation}
        options={{
          headerRight: () => null,
          title: "Receive Attestation"
        }}
      />
      <DeepLinkStack.Screen
        name="LoginShareAttestation"
        component={LoginShareAttestation}
        options={{
          headerRight: () => null,
          title: "Share Attestation data"
        }}
      />
      <DeepLinkStack.Screen
        name="LoginSignDataRequest"
        component={LoginSignDataRequest}
        options={{
          headerRight: () => null,
          title: "Sign Data Request"
        }}
      />
      <DeepLinkStack.Screen
        name="ViewAttestation"
        component={ViewAttestation}
        options={{
          title: "Attestation Details",
        }}
      />
    </DeepLinkStack.Navigator>
  );
};

export default DeepLinkStackScreens
