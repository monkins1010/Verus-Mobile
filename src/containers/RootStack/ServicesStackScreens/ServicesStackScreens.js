/*
  ServicesStackScreens
  2026-01-26: Removed notification bell icon from Services header by using
  custom screenOptions that sets headerRight to null.
*/
import React from 'react';
import { createStackNavigator } from "@react-navigation/stack";
import { defaultHeaderOptions } from '../../../utils/navigation/header';
import Services from '../../Services/Services'
import Service from '../../Services/Service/Service'
import NotificationScreen from '../../Notifications/NotificationScreen';
import WyreServiceAccountData from '../../Services/ServiceComponents/WyreService/WyreServiceAccount/WyreServiceAccountData/WyreServiceAccountData';
import WyreServiceAddPaymentMethod from '../../Services/ServiceComponents/WyreService/WyreServiceAccount/WyreServiceAddPaymentMethod/WyreServiceAddPaymentMethod';
import WyreServiceEditPaymentMethod from '../../Services/ServiceComponents/WyreService/WyreServiceAccount/WyreServiceEditPaymentMethod/WyreServiceEditPaymentMethod';
import GiftCardCreate from '../../Services/ServiceComponents/GiftCardService/GiftCardCreate/GiftCardCreate';
import GiftCardFund from '../../Services/ServiceComponents/GiftCardService/GiftCardFund/GiftCardFund';
import IdentityRegistrationNavigator from '../../Services/ServiceComponents/VerusIdService/IdentityRegistration/IdentityRegistrationNavigator';
import IdentityManagementNavigator from '../../Services/ServiceComponents/VerusIdService/IdentityManagement/IdentityManagementNavigator';
import LinkIdentities from '../../Services/ServiceComponents/VerusIdService/IdentityLinking/LinkIdentities';
import ViewAttestation from '../../Services/ServiceComponents/AttestationService/ViewAttestation/ViewAttestation';
import ValuAttestation from '../../Services/ServiceComponents/ValuService/ValuAttestation/ValuAttestation';
import ValuOnRampChooseSource from '../../Services/ServiceComponents/ValuService/ValuOnRamp/ValuOnRampChooseSource';
import ValuAttestationAccept from '../../Services/ServiceComponents/ValuService/ValuAttestationAccept/ValuAttestationAccept';
import ValuChooseIdentity from '../../Services/ServiceComponents/ValuService/ValuChooseIdentity/ValuChooseIdentity';
import AddressBook from '../../AddressBook/AddressBook';
import GetSponsoredAttestation from '../../Services/ServiceComponents/ValuService/GetSponsoredAttestation/GetSponsoredAttestation';

const ServicesStack = createStackNavigator();

// Custom screenOptions for Services stack - removes bell icon from header
const servicesHeaderOptions = (props) => ({
  ...defaultHeaderOptions(props),
  headerRight: () => null,
});

const ServicesStackScreens = props => {
  return (
    <ServicesStack.Navigator
      screenOptions={servicesHeaderOptions}
    >
      <ServicesStack.Screen
        name="Services"
        component={Services}
        options={{
          title: "Services",
        }}
      />
      <ServicesStack.Screen
        name="Service"
        component={Service}
      />
      <ServicesStack.Screen
        name="IdentityRegistration"
        component={IdentityRegistrationNavigator}
        options={{headerShown: false}}
      />
      <ServicesStack.Screen
        name="IdentityManagement"
        component={IdentityManagementNavigator}
        options={{headerShown: false}}
      />
      <ServicesStack.Screen
        name="LinkIdentities"
        component={LinkIdentities}
        options={{
          title: 'Link identities',
          headerStyle: {backgroundColor: '#fff'},
          headerTitleStyle: {fontSize: 17, fontWeight: '600', color: '#172033'},
          headerTintColor: '#3165d4', headerShadowVisible: false, headerBackTitleVisible: false,
          headerRight: () => null,
        }}
      />
      <ServicesStack.Screen
        name="WyreServiceAccountData"
        component={WyreServiceAccountData}
      />
      <ServicesStack.Screen
        name="WyreServiceAddPaymentMethod"
        component={WyreServiceAddPaymentMethod}
        options={{
          title: "Connect",
        }}
      />
      <ServicesStack.Screen
        name="WyreServiceEditPaymentMethod"
        component={WyreServiceEditPaymentMethod}
        options={{
          title: "Edit Account",
        }}
      />
      <ServicesStack.Screen
        name="GiftCardCreate"
        component={GiftCardCreate}
        options={{
          title: "Create Gift Card",
        }}
      />
      <ServicesStack.Screen
        name="GiftCardFund"
        component={GiftCardFund}
        options={{
          title: "Fund Gift Card",
        }}
      />
      <ServicesStack.Screen
        name="ViewAttestation"
        component={ViewAttestation}
        options={{
          title: "Attestation Details",
        }}
      />
      <ServicesStack.Screen
        name="ValuAttestation"
        component={ValuAttestation}
        options={{
          title: "VALU",
        }}
      />
      <ServicesStack.Screen
        name="ValuOnRampChooseSource"
        component={ValuOnRampChooseSource}
        options={{
          title: "VALU On Ramp",
        }}
      />
      <ServicesStack.Screen
        name="ValuAttestationAccept"
        component={ValuAttestationAccept}
        options={{
          title: "Accept KYC Attestation",
        }}
      />
      <ServicesStack.Screen
        name="ValuChooseIdentity"
        component={ValuChooseIdentity}
        options={{
          title: "Choose Identity",
        }}
      />
      <ServicesStack.Screen
        name="AddressBook"
        component={AddressBook}
        options={{
          title: "Address book",
          headerRight: () => null,
        }}
      />
      <ServicesStack.Screen
        name="GetSponsoredAttestation"
        component={GetSponsoredAttestation}
        options={{
          title: "Proof of Personhood",
        }}
      />
      <ServicesStack.Screen
        name="Notifications"
        component={NotificationScreen}
        options={{
          title: "Notifications",
          headerBackTitleVisible: false,
          headerBackTitle: '',
        }}
      />
    </ServicesStack.Navigator>
  );
};

export default ServicesStackScreens
