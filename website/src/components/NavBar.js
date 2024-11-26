import React, { useContext, useEffect, useState } from 'react';
import {
    AppBar,
    Box,
    Toolbar,
    Typography,
    Button,
    Link,
    Avatar,
    Menu,
    MenuItem,
    IconButton,
    useMediaQuery,
    FormControl,
    InputLabel,
    Select,
} from '@mui/material';
import {
    AccountCircleOutlined,
    AccountTree,
    LoginOutlined,
    Logout,
    Menu as MenuIcon,
    StorageOutlined,
    AdminPanelSettings,
} from '@mui/icons-material';

import apiv2 from '../utils/apiv2';
import NavBarItem from './NavBarItem';
import NavMenuItem from './NavMenuItem';
import userContext from '../contexts/userContext';
import { StudentSelectionContext } from './StudentSelectionWrapper';

export default function ButtonAppBar() {
    const { dispatchUserStateUpdate, isLoggedIn, isAdmin, pfpUrl } =
        useContext(userContext);
    const { selectedStudent, setSelectedStudent } = useContext(
        StudentSelectionContext,
    );
    const mobileView = useMediaQuery('(max-width:600px)');
    const tabList = [
        {
            name: 'Profile',
            href: '/',
            icon: <AccountCircleOutlined />,
        },
        {
            name: 'Buckets',
            href: '/buckets',
            icon: <StorageOutlined />,
        },
        {
            name: 'Concept Map',
            href: '/conceptmap',
            icon: <AccountTree />,
        },
    ];
    const [tabs, updateTabs] = useState(tabList.slice(1));
    const [anchorEl, setAnchorEl] = useState(null);

    function renderMenuItems(tabList) {
        return tabList.map((tab) => (
            <NavMenuItem
                icon={tab.icon}
                text={tab.name}
                onClick={() => {
                    window.location.href = tab.href;
                }}
            />
        ));
    }

    // Set up handlers for user menu
    function handleMenu(e) {
        setAnchorEl(e.currentTarget);
    }
    function handleClose() {
        setAnchorEl(null);
    }
    function doLogout() {
        localStorage.removeItem('token');
        localStorage.removeItem('email');
        dispatchUserStateUpdate({ type: 'logout' });
        window.location.reload(false);
    }

    // Moved from home.js
    function loadStudentData(e) {
        setSelectedStudent(e.target.value);
    }

    const [students, setStudents] = useState([]);
    useEffect(() => {
        let mounted = true;
        if (isAdmin) {
            updateTabs((prev) => [
                ...prev,
                {
                    name: 'Admin',
                    href: '/admin',
                    icon: <AdminPanelSettings />,
                },
            ]);
            apiv2.get('/students').then((res) => {
                if (mounted) {
                    setStudents(res.data.students);
                    setSelectedStudent(res.data.students[0][1]);
                }
            });
        }
        return () => (mounted = false);
    }, [isAdmin]);

    return (
        <Box sx={{ flexGrow: 1 }}>
            <AppBar position='static'>
                <Toolbar>
                    <Box sx={{ flexGrow: 1, gap: '20px' }} display='flex'>
                        <Typography
                            variant='h6'
                            component='div'
                            display='inline-block'
                        >
                            <a
                                href='/'
                                style={{
                                    textDecoration: 'none',
                                    color: 'inherit',
                                }}
                            >
                                GradeView
                            </a>
                        </Typography>
                        {!mobileView && (
                            <>
                                {isLoggedIn && (
                                    <NavBarItem href='/'>My Grades</NavBarItem>
                                )}
                                <NavBarItem href='/buckets'>Buckets</NavBarItem>
                                <NavBarItem href='/conceptmap'>
                                    Concept Map
                                </NavBarItem>
                                {isAdmin && (
                                    <NavBarItem href='/admin'>Admin</NavBarItem>
                                )}
                            </>
                        )}
                    </Box>
                    {isLoggedIn ? (
                        <>
                            {isAdmin && (
                                <Box>
                                    <FormControl
                                        size='small'
                                        sx={{ m: 1, minWidth: 100 }}
                                        variant={'filled'}
                                    >
                                        <InputLabel id='student-dropdown-label'>
                                            Student
                                        </InputLabel>
                                        <Select
                                            labelId='student-dropdown-label'
                                            id='student-dropdown'
                                            label='student'
                                            onChange={loadStudentData}
                                            style={{ backgroundColor: 'white' }}
                                            defaultValue={selectedStudent}
                                        >
                                            {students.map((student) => (
                                                <MenuItem
                                                    key={student[1]}
                                                    value={student[1]}
                                                >
                                                    {student[0]}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </Box>
                            )}
                            <IconButton onClick={handleMenu}>
                                <Avatar
                                    src={pfpUrl}
                                    imgProps={{ referrerPolicy: 'no-referrer' }}
                                />
                            </IconButton>
                            <Menu
                                id='loggedInMenu'
                                anchorEl={anchorEl}
                                anchorOrigin={{
                                    vertical: 'top',
                                    horizontal: 'right',
                                }}
                                keepMounted
                                transformOrigin={{
                                    vertical: 'top',
                                    horizontal: 'right',
                                }}
                                open={Boolean(anchorEl)}
                                onClose={handleClose}
                            >
                                {mobileView && renderMenuItems(tabs)}
                                <NavMenuItem
                                    icon={<Logout />}
                                    text={'Logout'}
                                    onClick={doLogout}
                                />
                            </Menu>
                        </>
                    ) : (
                        <>
                            {mobileView ? (
                                <>
                                    <IconButton
                                        onClick={handleMenu}
                                        color='inherit'
                                    >
                                        <MenuIcon />
                                    </IconButton>
                                    <Menu
                                        id='loggedInMenuMobile'
                                        anchorEl={anchorEl}
                                        anchorOrigin={{
                                            vertical: 'top',
                                            horizontal: 'right',
                                        }}
                                        keepMounted
                                        transformOrigin={{
                                            vertical: 'top',
                                            horizontal: 'right',
                                        }}
                                        open={Boolean(anchorEl)}
                                        onClose={handleClose}
                                    >
                                        <NavMenuItem
                                            icon={<LoginOutlined />}
                                            text={'Login'}
                                            onClick={() => {
                                                window.location.href = '/login';
                                            }}
                                        />
                                        {renderMenuItems(tabs)}
                                    </Menu>
                                </>
                            ) : (
                                <Link
                                    href='/login'
                                    color='inherit'
                                    underline='none'
                                >
                                    <Button variant='outlined' color='inherit'>
                                        Login
                                    </Button>
                                </Link>
                            )}
                        </>
                    )}
                </Toolbar>
            </AppBar>
        </Box>
    );
}
