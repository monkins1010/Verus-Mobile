import React, { Component } from "react";
import { connect } from 'react-redux';
import {
    SafeAreaView,
    TouchableWithoutFeedback,
    Linking,
    Alert,
    Keyboard,
    View
} from 'react-native';
import {
    ActivityIndicator
} from 'react-native-paper';
import InAppBrowser from 'react-native-inappbrowser-reborn';
import { CommonActions } from '@react-navigation/native';
import { completeOfframpRequest } from "../../../../../actions/actions/channels/valu/dispatchers/ValuWalletReduxManager";

import Styles from "../../../../../styles";

class ValuOffRampReview extends Component {
    constructor(props) {
        super(props);

        this.state = {
            loading: false,
            offRampRequest: props.valuService.offRampRequest || null
        };

        this.getValuOffRamps = this.getValuOffRamps.bind(this);        
    }

    async componentDidMount() {
        this.setState({ loading: true });

        const partnerUserId = this.props.valuService.partnerUserId || null;

        if (partnerUserId == null) {
            Alert.alert("Error", "Failed to load partner user ID. Please try again.");
            this.resetToScreen('CoinMenus', 'Overview');
            return;
        }

        const onRampRequests = Object.keys(this.props.valuService.onrampRequests);

        if (onRampRequests.length > 0) {
            Alert.alert("Error", "You have an active off-ramp request. Please wait for it to complete before starting a new one.");
            this.resetToScreen('CoinMenus', 'Overview');
            return;
        }

        const { offRampRequest } = this.state;

        if (offRampRequest && offRampRequest.url == null) {
            Alert.alert("Error", "Failed to load off-ramp request. Please try again.");
            this.resetToScreen('CoinMenus', 'Overview');
            return; 
        }

        this.getValuOffRamps();



    }

    resetToScreen = () => {
        const resetAction = CommonActions.reset({
            index: 0,
            routes: [{ name: 'SignedInStack' }],
        });
        this.props.navigation.dispatch(resetAction);
    };

    async getValuOffRamps() {
        try {
            const { offRampRequest } = this.state;
            const url = offRampRequest.url;
            completeOfframpRequest();
            if (await InAppBrowser.isAvailable()) {
                InAppBrowser.open(url, {
                    // iOS Properties
                    dismissButtonStyle: 'cancel',
                    preferredBarTintColor: '#00A1CC',
                    preferredControlTintColor: 'white',
                    readerMode: false,
                    animated: true,
                    modalPresentationStyle: 'fullScreen',
                    modalTransitionStyle: 'coverVertical',
                    modalEnabled: true,
                    enableBarCollapsing: false,
                    // Android Properties
                    showTitle: false,
                    toolbarColor: '#00A1CC',
                    secondaryToolbarColor: 'black',
                    navigationBarColor: 'black',
                    navigationBarDividerColor: 'white',
                    enableUrlBarHiding: true,
                    enableDefaultShare: false,
                    forceCloseOnRedirection: false,
                    animations: {
                        startEnter: 'slide_in_right',
                        startExit: 'slide_out_left',
                        endEnter: 'slide_in_left',
                        endExit: 'slide_out_right'
                    }
                });
                this.resetToScreen('CoinMenus', 'Overview');
            } else {
                Linking.openURL(url);
            }

        } catch (error) {
            console.error("Error starting on-ramp:", error);
            Alert.alert("Error", "Failed to start the purchase process. Please try again.");
        }


    }

    render() {
        return (
            <SafeAreaView style={Styles.defaultRoot}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    {this.state.loading && (
                        <ActivityIndicator
                            animating={true}
                            size={100}
                        />
                    )}
                </View>
            </TouchableWithoutFeedback>
        </SafeAreaView>
        )
    };
}


const mapStateToProps = (state) => {

    return {
        activeAccount: state.authentication.activeAccount,
        encryptedPersonalData: state.personal,
        allSubWallets: state.coinMenus.allSubWallets,
        activeCoin: state.coins.activeCoinList,
        valuService: state.channelStore_valu_service
    };
};

export default connect(mapStateToProps)(ValuOffRampReview);