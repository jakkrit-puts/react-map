import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home';

export const URL_API = import.meta.env.VITE_APP_API_URL;
export const API_KEY = import.meta.env.VITE_APP_API_KEY;

export default function App() {

  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route path='/' element={<Home />}></Route>
        </Routes>
      </BrowserRouter>
    </>
  )
}
