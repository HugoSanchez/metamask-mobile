import React, { Component } from 'react';
import Engine from '../../../core/Engine';
import Icon from 'react-native-vector-icons/FontAwesome';
import Identicon from '../Identicon';
import PropTypes from 'prop-types';
import {
	ActivityIndicator,
	InteractionManager,
	ScrollView,
	TouchableOpacity,
	StyleSheet,
	Text,
	View,
	SafeAreaView
} from 'react-native';
import { colors, fontStyles } from '../../../styles/common';
import { renderFromWei } from '../../../util/number';
import { strings } from '../../../../locales/i18n';
import { toChecksumAddress } from 'ethereumjs-util';
import Logger from '../../../util/Logger';

const styles = StyleSheet.create({
	wrapper: {
		backgroundColor: colors.white,
		borderTopLeftRadius: 10,
		borderTopRightRadius: 10,
		minHeight: 450
	},
	titleWrapper: {
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderColor: colors.borderColor
	},
	title: {
		textAlign: 'center',
		fontSize: 18,
		marginVertical: 12,
		marginHorizontal: 20,
		color: colors.fontPrimary,
		...fontStyles.bold
	},
	accountsWrapper: {
		flex: 1
	},
	account: {
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderColor: colors.borderColor,
		flexDirection: 'row',
		paddingHorizontal: 20,
		paddingVertical: 20
	},
	accountInfo: {
		marginLeft: 15,
		flex: 1
	},
	accountLabel: {
		fontSize: 18,
		color: colors.fontPrimary,
		...fontStyles.normal
	},
	accountBalance: {
		paddingTop: 5,
		fontSize: 12,
		color: colors.fontSecondary,
		...fontStyles.normal
	},
	selected: {
		marginRight: 15,
		alignContent: 'flex-end'
	},
	footer: {
		borderTopWidth: StyleSheet.hairlineWidth,
		borderColor: colors.borderColor,
		height: 80,
		justifyContent: 'center',
		flexDirection: 'row',
		alignItems: 'center',
		paddingBottom: 30
	},
	addAccountText: {
		fontSize: 16,
		color: colors.primary,
		...fontStyles.normal
	}
});

/**
 * View that contains the list of all the available accounts
 */
export default class AccountList extends Component {
	static propTypes = {
		/**
		 * Map of accounts to information objects including balances
		 */
		accounts: PropTypes.object,
		/**
		 * An object containing each identity in the format address => account
		 */
		identities: PropTypes.object,
		/**
		 * A string representing the selected address => account
		 */
		selectedAddress: PropTypes.string,
		/**
		 * An object containing all the keyrings
		 */
		keyrings: PropTypes.array,
		/**
		 * function to be called when switching accounts
		 */
		onAccountChange: PropTypes.func
	};

	state = {
		selectedAccountIndex: 0,
		loading: false
	};

	scrollViewRef = React.createRef();
	lastPosition = 0;

	getInitialSelectedAccountIndex = () => {
		const { identities, selectedAddress } = this.props;
		Object.keys(identities).forEach((address, i) => {
			if (selectedAddress === address) {
				this.setState({ selectedAccountIndex: i });
			}
		});
	};

	componentDidUpdate() {
		this.scrollToCurrentAccount();
	}

	scrollToCurrentAccount() {
		const position = this.state.selectedAccountIndex * 68;
		if (position < 400) return;
		if (position - this.lastPosition < 68) return;
		InteractionManager.runAfterInteractions(() => {
			!this.scrolling &&
				this.scrollViewRef &&
				this.scrollViewRef.current &&
				this.scrollViewRef.current.scrollTo({
					x: 0,
					y: position,
					animated: true
				});
			this.scrolling = true;
			setTimeout(() => {
				this.scrolling = false;
				this.lastPosition = position;
			}, 500);
		});
	}

	componentDidMount() {
		this.getInitialSelectedAccountIndex();
	}

	onAccountChange = async newIndex => {
		const previousIndex = this.state.selectedAccountIndex;
		const { PreferencesController } = Engine.context;
		const { keyrings } = this.props;
		try {
			this.setState({ selectedAccountIndex: newIndex });
			// This is a temporary fix until we can read the state from GABA
			const allKeyrings =
				keyrings && keyrings.length ? keyrings : Engine.context.KeyringController.state.keyrings;
			const accountsOrdered = allKeyrings.reduce((list, keyring) => list.concat(keyring.accounts), []);

			await PreferencesController.update({ selectedAddress: accountsOrdered[newIndex] });

			this.props.onAccountChange();

			InteractionManager.runAfterInteractions(() => {
				Engine.refreshTransactionHistory();
				const { AssetsDetectionController, AccountTrackerController } = Engine.context;
				AssetsDetectionController.detectAssets();
				AccountTrackerController.refresh();
			});
		} catch (e) {
			// Restore to the previous index in case anything goes wrong
			this.setState({ selectedAccountIndex: previousIndex });
			Logger.error('error while trying change the selected account', e); // eslint-disable-line
		}
	};

	addAccount = async () => {
		this.setState({ loading: true });
		const { KeyringController } = Engine.context;
		try {
			await KeyringController.addNewAccount();
			const { PreferencesController } = Engine.context;
			const newIndex = Object.keys(this.props.identities).length - 1;
			await PreferencesController.update({ selectedAddress: Object.keys(this.props.identities)[newIndex] });
			this.setState({ selectedAccountIndex: newIndex });
			setTimeout(() => {
				this.scrollViewRef && this.scrollViewRef.current && this.scrollViewRef.current.scrollToEnd();
				this.setState({ loading: false });
			}, 500);
		} catch (e) {
			// Restore to the previous index in case anything goes wrong
			Logger.error('error while trying to add a new account', e); // eslint-disable-line
			this.setState({ loading: false });
		}
	};

	renderAccounts() {
		const { accounts, identities, selectedAddress, keyrings } = this.props;
		// This is a temporary fix until we can read the state from GABA
		const allKeyrings = keyrings && keyrings.length ? keyrings : Engine.context.KeyringController.state.keyrings;
		const accountsOrdered = allKeyrings.reduce((list, keyring) => list.concat(keyring.accounts), []);
		return accountsOrdered.filter(address => !!identities[toChecksumAddress(address)]).map((addr, index) => {
			const checksummedAddress = toChecksumAddress(addr);
			const identity = identities[checksummedAddress];
			const { name, address } = identity;
			const isSelected = toChecksumAddress(address) === toChecksumAddress(selectedAddress);
			let balance = 0x0;
			if (accounts[toChecksumAddress(address)]) {
				balance = accounts[toChecksumAddress(address)].balance;
			}
			const selected = isSelected ? <Icon name="check" size={30} color={colors.success} /> : null;

			return (
				<TouchableOpacity
					style={styles.account}
					key={`account-${address}`}
					onPress={() => this.onAccountChange(index)} // eslint-disable-line
				>
					<Identicon address={address} diameter={38} />
					<View style={styles.accountInfo}>
						<Text style={styles.accountLabel}>{name}</Text>
						<Text style={styles.accountBalance}>
							{renderFromWei(balance)} {strings('unit.eth')}
						</Text>
					</View>
					<View style={styles.selected}>{selected}</View>
				</TouchableOpacity>
			);
		});
	}

	render = () => (
		<SafeAreaView style={styles.wrapper} testID={'account-list'}>
			<View style={styles.titleWrapper}>
				<Text testID={'account-list-title'} style={styles.title}>
					{strings('accounts.title')}
				</Text>
			</View>
			<ScrollView ref={this.scrollViewRef} style={styles.accountsWrapper}>
				{this.renderAccounts()}
			</ScrollView>
			<View style={styles.footer}>
				<TouchableOpacity onPress={this.addAccount}>
					{this.state.loading ? (
						<ActivityIndicator size="small" color={colors.primary} />
					) : (
						<Text style={styles.addAccountText}>{strings('accounts.create_new_account')}</Text>
					)}
				</TouchableOpacity>
			</View>
		</SafeAreaView>
	);
}