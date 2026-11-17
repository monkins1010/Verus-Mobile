/*
  Updated SeedWords screen:
  - Top-aligned layout with left-aligned title (black) matching ChooseName.js
  - Card-based layout for displaying seed words in a clean list
  - Modern verification inputs with better styling
  - Primary button matches design system (#CFEAF2 when disabled)
  - Back button with text style for secondary action
  - 2026-01-26: Updated primary button to GradientButton, secondary button to match
    Unlock.js styling, and inputs to use container-based focus state pattern.
*/
import React, {useEffect, useState} from 'react';
import {
  View,
  Dimensions,
  Keyboard,
  TextInput as RNTextInput,
  TouchableWithoutFeedback,
  Alert,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import {Text, TextInput, Checkbox} from 'react-native-paper';
import Button from '../../../../../components/Button';
import TallButton from '../../../../../components/LargerButton';
import Colors from '../../../../../globals/colors';
import {
  DEFAULT_SEED_PHRASE_LENGTH,
  SMALL_DEVICE_HEGHT,
} from '../../../../../utils/constants/constants';

export default function SeedWords({navigation, newSeed, onComplete, testProfile}) {
  const {height} = Dimensions.get('window');

  const [formStep, setFormStep] = useState(0);
  const [seedWords, setSeedWords] = useState(newSeed.split(' '));

  const [isAtEnd, setIsAtEnd] = useState(formStep >= seedWords.length / 8);
  const [firstIndex, setFirstIndex] = useState(formStep * 8);
  const [displayWords, setDisplayWords] = useState(
    !isAtEnd ? seedWords.slice(firstIndex, firstIndex + 8) : [],
  );

  const [randomIndices, setRandomIndices] = useState([0, 0, 0]);

  const [wordGuesses, setWordGuesses] = useState(['', '', '']);
  const [wordErrors, setWordErrors] = useState([false, false, false]);
  const [useSeedAsZ, setUseSeedAsZ] = useState(!testProfile);
  const [focusedInput, setFocusedInput] = useState(-1);

  const resetForm = () => {
    setFormStep(0);
    setSeedWords(newSeed.split(' '));
    setUseSeedAsZ(!testProfile);
  };

  const getRandIndex = (exclusions = []) => {
    let rand = Math.round(Math.random() * (DEFAULT_SEED_PHRASE_LENGTH - 1));

    while (exclusions.includes(rand)) {
      rand = Math.round(Math.random() * (DEFAULT_SEED_PHRASE_LENGTH - 1));
    }

    return rand;
  };

  const verifySeed = () => {
    setWordErrors([false, false, false]);

    let errors = false;
    let guessErrors = [false, false, false];

    wordGuesses.map((wordGuess, index) => {
      if (wordGuess !== seedWords[randomIndices[index]]) {
        errors = true;
        guessErrors[index] = true;
      }
    });

    if (errors) {
      Alert.alert('Incorrect', 'One or more words do not match.');
    }

    setWordErrors(guessErrors);

    if (!errors) {
      onComplete(useSeedAsZ);
    }
  };

  const next = () => {
    if (isAtEnd) {
      verifySeed();
    } else {
      setFormStep(formStep + 1);
    }
  };

  const back = () => {
    if (formStep > 0) {
      setFormStep(formStep - 1);
    }
  };

  useEffect(() => {
    resetForm();
  }, [newSeed]);

  useEffect(() => {
    setIsAtEnd(formStep >= seedWords.length / 8);
    setFirstIndex(formStep * 8);
  }, [formStep, newSeed]);

  useEffect(() => {
    setDisplayWords(
      !isAtEnd ? seedWords.slice(firstIndex, firstIndex + 8) : [],
    );
  }, [firstIndex, isAtEnd]);

  useEffect(() => {
    if (isAtEnd) {
      const first = getRandIndex();
      const second = getRandIndex([first]);
      const third = getRandIndex([first, second]);

      setRandomIndices([first, second, third]);
    }
  }, [isAtEnd]);

  useEffect(() => {
    setWordErrors([false, false, false]);
  }, [wordGuesses, randomIndices]);

  const getTitle = () => {
    if (isAtEnd) {
      return 'Verify your seed';
    }
    const start = firstIndex + 1;
    const end = firstIndex + 8;
    return `Words ${start}–${end}`;
  };

  const getSubtitle = () => {
    if (isAtEnd) {
      return 'Enter the following words to verify you wrote them down correctly.';
    }
    return 'Write down these words in order. Keep them safe and secure.';
  };

  return (
    <SafeAreaView style={{flex: 1, backgroundColor: Colors.secondaryColor}}>
      <KeyboardAvoidingView
        style={{flex: 1}}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}>
        <View style={{flex: 1, backgroundColor: Colors.secondaryColor}}>
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              paddingHorizontal: 24,
              paddingTop: height < SMALL_DEVICE_HEGHT ? 40 : 60,
              paddingBottom: 24,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
              <View style={{flex: 1}}>
                {/* Title - top-aligned, left-aligned, black */}
                <Text
                  style={{
                    textAlign: 'left',
                    color: '#1A1A1A',
                    fontSize: 32,
                    fontWeight: '700',
                    letterSpacing: -0.5,
                    marginBottom: 12,
                  }}>
                  {getTitle()}
                </Text>

                {/* Subtitle - left-aligned, improved typography */}
                <Text
                  style={{
                    textAlign: 'left',
                    fontSize: 16,
                    lineHeight: 22,
                    color: '#555',
                    marginBottom: 24,
                  }}>
                  {getSubtitle()}
                </Text>

                {isAtEnd ? (
                  /* Verification inputs */
                  <View style={{marginBottom: 16}}>
                    {randomIndices.map((randomI, index) => (
                      <View key={index} style={{marginBottom: 16}}>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '600',
                            color: '#1A1A1A',
                            marginBottom: 8,
                          }}>
                          {`Word ${randomI + 1}`}
                        </Text>
                        <View
                          style={[
                            styles.inputContainer,
                            focusedInput === index && styles.inputContainerFocused,
                            wordErrors[index] && styles.inputContainerError,
                          ]}
                        >
                          <RNTextInput
                            value={wordGuesses[index]}
                            onChangeText={text => {
                              let newGuesses = [...wordGuesses];
                              newGuesses[index] = text.toLowerCase().trim();
                              setWordGuesses(newGuesses);
                            }}
                            onFocus={() => setFocusedInput(index)}
                            onBlur={() => setFocusedInput(-1)}
                            placeholder={`Enter word ${randomI + 1}...`}
                            placeholderTextColor="#999"
                            returnKeyType={index === 2 ? 'done' : 'next'}
                            autoCorrect={false}
                            autoCapitalize="none"
                            spellCheck={false}
                            style={styles.input}
                          />
                        </View>
                        {wordErrors[index] && (
                          <Text
                            style={{
                              fontSize: 12,
                              color: Colors.warningButtonColor,
                              marginTop: 4,
                              marginLeft: 4,
                            }}>
                            {'This word does not match'}
                          </Text>
                        )}
                      </View>
                    ))}
                  </View>
                ) : (
                  /* Word display card */
                  <Card
                    mode="outlined"
                    style={{
                      borderRadius: 12,
                      backgroundColor: '#FAFAFA',
                      borderWidth: 1,
                      borderColor: '#E0E0E0',
                      marginBottom: 24,
                    }}>
                    <Card.Content style={{paddingVertical: 16, paddingHorizontal: 16}}>
                      {displayWords.map((word, index) => (
                        <View
                          key={index}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingVertical: 12,
                            borderBottomWidth: index < displayWords.length - 1 ? 1 : 0,
                            borderBottomColor: '#E8E8E8',
                          }}>
                          <Text
                            style={{
                              fontSize: 14,
                              fontWeight: '600',
                              color: '#888',
                              width: 60,
                            }}>
                            {`Word ${firstIndex + index + 1}`}
                          </Text>
                          <Text
                            style={{
                              fontSize: 18,
                              color: '#1A1A1A',
                              fontWeight: '600',
                              flex: 1,
                            }}>
                            {word}
                          </Text>
                        </View>
                      ))}
                    </Card.Content>
                  </Card>
                )}

                {/* Spacer - now uses minHeight instead of flex */}
                <View style={{minHeight: 20, flex: 1}} />

                {/* Instruction text */}
                {!isAtEnd && (
                  <Text
                    style={{
                      textAlign: 'center',
                      fontSize: 14,
                      color: '#666',
                      marginBottom: 16,
                    }}>
                    {"When you've written them down, press next."}
                  </Text>
                )}

                {/* Buttons */}
                <View style={{flexDirection: 'row', gap: 12}}>
                  {formStep > 0 && (
                    <Button
                      mode="contained"
                      onPress={back}
                      style={styles.secondaryButton}
                      contentStyle={styles.secondaryButtonContent}
                      labelStyle={styles.secondaryButtonLabel}
                      buttonColor="#EBF6FF"
                      textColor={Colors.primaryColor}
                    >
                      {'Back'}
                    </Button>
                  )}
                  <GradientButton
                    onPress={next}
                    disabled={
                      isAtEnd &&
                      (wordGuesses[0].length === 0 ||
                        wordGuesses[1].length === 0 ||
                        wordGuesses[2].length === 0)
                    }
                    style={formStep > 0 ? styles.primaryButtonFlex : styles.primaryButton}
                  >
                    {isAtEnd ? 'Complete' : 'Next'}
                  </GradientButton>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F7F7',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    height: 52,
  },
  inputContainerFocused: {
    backgroundColor: '#FFF',
    borderColor: Colors.primaryColor,
    shadowColor: Colors.primaryColor,
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: {width: 0, height: 2},
  },
  inputContainerError: {
    backgroundColor: '#FFF',
    borderColor: Colors.warningButtonColor,
    shadowColor: Colors.warningButtonColor,
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: {width: 0, height: 2},
  },
  input: {
    flex: 1,
    height: 52,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#000',
  },
  primaryButton: {
    width: '100%',
  },
  primaryButtonFlex: {
    flex: 1,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 0,
    backgroundColor: '#EBF6FF',
    elevation: 0,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: {width: 0, height: 0},
  },
  secondaryButtonContent: {
    height: 56,
  },
  secondaryButtonLabel: {
    color: Colors.primaryColor,
    fontWeight: '700',
    fontSize: 16,
    textTransform: 'none',
    letterSpacing: -0.2,
  },
});
