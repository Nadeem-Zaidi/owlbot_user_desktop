import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

interface StorageSearchState {
    query: string;
}

const initialState: StorageSearchState = {
    query: "",
};

export const storageSearchSlice = createSlice({
    name: "storageSearch",
    initialState,
    reducers: {
        setStorageSearchQuery: (state, action: PayloadAction<string>) => {
            state.query = action.payload;
        },
        clearStorageSearchQuery: (state) => {
            state.query = "";
        },
    },
});

export const { setStorageSearchQuery, clearStorageSearchQuery } = storageSearchSlice.actions;
export default storageSearchSlice.reducer;
