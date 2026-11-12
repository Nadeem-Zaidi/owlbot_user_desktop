import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { auth } from "@/shared/lib/firebase";

interface User {
  uid: string;
  phoneNumber?: string | null;
  email?: string | null;
  displayName?: string | null;
}

interface AuthenticationState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
}

const initialState: AuthenticationState = {
  isAuthenticated: false,
  user: null,
  token: null,
  loading: false,
  error: null,
};

export const logOutUser = createAsyncThunk("authentication/logout", async (_, { rejectWithValue }) => {
  try {
    await auth.signOut()
    return true;


  } catch (error: any) {
    return rejectWithValue(error.message)
  }
});

export const verifyToken = createAsyncThunk("authentication/verifyToken", async () => {
  // try {
  //   const response=await fetch()

  // } catch (error: any) {

  // }
})

export const authenticationSlice = createSlice({
  name: "authentication",
  initialState,
  reducers: {
    authStart: (state) => {
      state.loading = true;
      state.error = null;
    },

    authSuccess: (
      state,
      action: PayloadAction<{ user: User; token: string | null }>
    ) => {
      state.loading = false;
      state.isAuthenticated = true;
      state.user = action.payload.user;
      state.token = action.payload.token;
    },

    authFailure: (state, action: PayloadAction<string>) => {
      state.loading = false;
      state.error = action.payload;
    },

    signOut: (state) => {
      state.isAuthenticated = false;
      state.user = null;
      state.token = null;
      state.loading = false;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(logOutUser.pending, (state) => {
        state.loading = true;
      })
      .addCase(logOutUser.fulfilled, (state) => {
        state.loading = false;
        state.user = null;
        state.token = null;
        state.error = null;
        state.isAuthenticated = false;
      })
  }
});

export const { authStart, authSuccess, authFailure, signOut } =
  authenticationSlice.actions;

export default authenticationSlice.reducer;