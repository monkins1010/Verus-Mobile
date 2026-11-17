import { SET_DEEPLINK_DATA, SET_DEEPLINK_URL, SET_DEEPLINK_CANCEL } from "../../../../utils/constants/storeType"

export const setDeeplinkUrl = (url, passthrough = null) => {
  return {
    type: SET_DEEPLINK_URL,
    payload: { url, passthrough }
  }
}

export const setDeeplinkData = (
  id,
  data,
  fromService = null,
  passthrough = null,
) => {
  return {
    type: SET_DEEPLINK_DATA,
    payload: { id, data, fromService, passthrough }
  }
}

export const setDeeplinkCancel = (cancel) => {
  return {
    type: SET_DEEPLINK_CANCEL,
    payload: { cancel }
  }
}

export const resetDeeplinkData = expectedRequestId => {
  return {
    type: SET_DEEPLINK_DATA,
    payload: {id: null, data: {}, fromService: null, passthrough: null,
      ...(expectedRequestId == null ? {} : {expectedRequestId}), cancel: null}
  }
}
