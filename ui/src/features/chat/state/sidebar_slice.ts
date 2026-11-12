import { createSlice } from "@reduxjs/toolkit";

interface SideBar{
    showSideBar:boolean
}

const initialState:SideBar={
    showSideBar:true
}


export const sideBarSlice=createSlice({
    name:'sideBar',
    initialState,
    reducers:{
        toggleSideBar:((state)=>{
            state.showSideBar = !state.showSideBar
        })
    }


})

export  const {toggleSideBar}=sideBarSlice.actions
export default sideBarSlice.reducer