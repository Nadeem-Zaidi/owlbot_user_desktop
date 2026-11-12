import { configureStore } from "@reduxjs/toolkit";
import chatStateReducer from "@/features/chat/state/chat_mode_slice";
import sideBarReducer from "@/features/chat/state/sidebar_slice";
import authenticationReducer from "@/features/auth/state/auth_slice";
import { useDispatch, useSelector} from "react-redux";
import { storageApi } from "@/features/storage/api/storage_api";
import sessionReducer from "@/features/chat/state/session_slice";
import storageSearchReducer from "@/features/storage/state/storage_search_slice";

export const store = configureStore({
  reducer: {
    chatState: chatStateReducer,
    sideBar: sideBarReducer,
    authentication: authenticationReducer,
    session: sessionReducer,
    storageSearch: storageSearchReducer,
    [storageApi.reducerPath]: storageApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(storageApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
