import { createSlice, type PayloadAction } from "@reduxjs/toolkit"
const STORAGE_KEY = "chat_state"

interface ChatState {
    chatMode: boolean
    currentSessionId?: string | null
}

const loadInitialState = ():ChatState => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return { chatMode: false, currentSessionId: null }
        }
        return JSON.parse(raw)
    } catch (err: any) {
        return { chatMode: false, currentSessionId: null }

    }
}



export const chatModeSlice = createSlice({
    name: 'chatMode',
    initialState:loadInitialState,
    reducers: {
        updateChatMode: (state, action: PayloadAction<ChatState>) => {
            state.chatMode = action.payload.chatMode
            state.currentSessionId = action.payload.currentSessionId ? action.payload.currentSessionId : null
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                chatMode: state.chatMode,
                currentSessionId: state.currentSessionId,
            }))
        }
    }
})

export const { updateChatMode } = chatModeSlice.actions
export default chatModeSlice.reducer