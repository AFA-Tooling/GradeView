import axios from 'axios';
import React, { useContext, useEffect, useState } from 'react';
import {
    OutlinedInput,
    Stack,
    Button,
    InputAdornment,
    IconButton,
    FormControl,
    InputLabel,
    Typography,
    Alert,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';

import userContext from '../contexts/userContext';

export default function Login() {
    const navigate = useNavigate();
    const { dispatchUserStateUpdate } = useContext(userContext);
    const [error, setError] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    // Initialize the google OAUTH
    useEffect(() => {
        /* global google */
        google.accounts.id.initialize({
            client_id:
                '435032403387-5sph719eh205fc6ks0taft7ojvgipdji.apps.googleusercontent.com',
            callback: handleGoogleLogin,
        });
        google.accounts.id.renderButton(
            document.querySelector('#googleSignInButton'),
            {},
        );
    }, []);

    // Updates OAuth2 token to be the local token value
    async function handleGoogleLogin(authData) {
        const token = `Bearer ${authData.credential}`;
        axios
            .get(`/api/v2/login`, {
                headers: { Authorization: token },
            })
            .then((loginRes) => {
                if (!loginRes.data.status) {
                    setError(
                        'You are not a registered student or admin.  Please contact course staff if you think this is a mistake',
                    );
                    return;
                }
                localStorage.setItem('token', token);
                const credData = jwtDecode(authData.credential);
                // TODO: this is pretty awful.  We should have this in a context or something.
                localStorage.setItem('email', credData?.email);
                localStorage.setItem('profilepicture', credData?.picture);
                dispatchUserStateUpdate({
                    type: 'setEmail',
                    payload: credData?.email,
                });
                dispatchUserStateUpdate({
                    type: 'setPfpUrl',
                    payload: credData?.picture,
                });
                dispatchUserStateUpdate({ type: 'login' });
                navigate('/');
                window.location.reload(false);
            })
            .catch((e) => {
                console.error(e);
                setError('An error occurred.  Please try again later');
            });
    }

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                setError('Incorrect username or password');
            }}
        >
            <Stack
                spacing={2}
                sx={{
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    position: 'absolute',
                    top: '50%',
                    transform: 'translate(0, -50%)',
                }}
            >
                <Typography variant='h3' sx={{ fontWeight: 500 }}>
                    Login
                </Typography>
                <FormControl sx={{ m: 1, width: '25ch' }} variant='outlined'>
                    <InputLabel htmlFor='username'>Username</InputLabel>
                    <OutlinedInput
                        id='username'
                        autoComplete='username'
                        label='Username'
                        onChange={(e) => {
                            setUsername(e.target.value);
                        }}
                    />
                </FormControl>
                <FormControl sx={{ m: 1, width: '25ch' }} variant='outlined'>
                    <InputLabel htmlFor='password'>Password</InputLabel>
                    <OutlinedInput
                        id='password'
                        type={showPassword ? 'text' : 'password'}
                        autoComplete='current-password'
                        endAdornment={
                            <InputAdornment position='end'>
                                <IconButton
                                    aria-label='toggle password visibility'
                                    onClick={() =>
                                        setShowPassword((prev) => !prev)
                                    }
                                    edge='end'
                                >
                                    {showPassword ? (
                                        <VisibilityOff />
                                    ) : (
                                        <Visibility />
                                    )}
                                </IconButton>
                            </InputAdornment>
                        }
                        label='Password'
                        onChange={(e) => {
                            setPassword(e.target.value);
                        }}
                    />
                </FormControl>
                {error && <Alert severity='error'>{error}</Alert>}
                <Button type='submit' variant='contained' size='large'>
                    Login
                </Button>
                <p>
                    <i>or</i>
                </p>
                <div id='googleSignInButton' />
            </Stack>
        </form>
    );
}
